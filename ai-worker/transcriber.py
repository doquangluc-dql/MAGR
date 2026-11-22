"""
Chép bài làm viết tay theo từng vùng (region-conditioned transcription).

Box lấy từ Unlimited-OCR (thang 0-999, [x1, y1, x2, y2]) được vẽ lên ảnh kèm nhãn B1, B2...
rồi gửi cho Gemini (qua OpenRouter) để chép nội dung của TỪNG vùng. Nhờ vậy nội dung trả về
khớp sẵn với vị trí trên ảnh, không cần bước so khớp text sau đó.
"""
import io
import json
import base64
from typing import Any, Dict, List, Optional, Tuple

import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps

DEFAULT_TRANSCRIBE_MODEL = "google/gemini-3.7-flash"
MAX_SIDE = 1600
FULL_PAGE_BOX = [0, 0, 999, 999]
UNREADABLE = "[?]"

# Màu khung (RGB) xoay vòng giữa các vùng cạnh nhau cho dễ phân biệt
BOX_COLORS = [(220, 38, 38), (37, 99, 235), (22, 163, 74), (217, 119, 6), (147, 51, 234), (8, 145, 178)]

PROMPT_TEMPLATE = """You are a meticulous transcriber of handwritten math exam solutions written in Vietnamese or English.
The image shows ONE student's solution. A layout detector found the regions below; each is drawn on
the image as a thin colored rectangle labeled with its ID (B1, B2, ...) just above its top-left corner.
Coordinates are [x_min, y_min, x_max, y_max], normalized 0-999 relative to image width/height:
{regions}

Task: for EVERY region ID, transcribe exactly what the student wrote inside that rectangle.

Rules:
1. Be faithful. Copy exactly what is written, INCLUDING mistakes and wrong results. Never correct,
   complete, simplify or solve anything.
2. Write math in LaTeX: inline as $...$, standalone equations as $$...$$. Keep normal text in its
   original language with Vietnamese diacritics.
3. Keep the student's line breaks (\\n) and reading order (top-to-bottom, left-to-right).
4. Omit content that is clearly crossed out.
5. Use [?] for characters you cannot read. Do not guess.
6. Every line of writing belongs to exactly ONE region (the one containing most of it). Never
   repeat the same text in two regions.
7. Ignore the drawn rectangles and labels themselves.
8. Put any writing that lies outside all rectangles into "unboxed" (empty string if none).
9. If a region has no readable writing, return latex "".
Return only JSON matching the schema."""


def order_boxes(bboxes: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Lọc box hợp lệ, sắp theo thứ tự đọc (trên xuống, trái sang) và gán id B1, B2..."""
    valid = []
    for item in bboxes or []:
        bbox = item.get("bbox") if isinstance(item, dict) else None
        if isinstance(bbox, list) and len(bbox) == 4 and bbox[2] > bbox[0] and bbox[3] > bbox[1]:
            valid.append({"bbox": [int(v) for v in bbox], "type": item.get("type", "text")})
    if not valid:
        valid = [{"bbox": list(FULL_PAGE_BOX), "type": "page"}]
    valid.sort(key=lambda b: (b["bbox"][1], b["bbox"][0]))
    for idx, b in enumerate(valid):
        b["box_id"] = f"B{idx + 1}"
    return valid


def load_image(image_bytes: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)  # ảnh chụp điện thoại thường có cờ xoay EXIF
    img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    return img


def draw_regions(img: Image.Image, boxes: List[Dict[str, Any]]) -> Image.Image:
    """Vẽ khung + nhãn Bk; nhãn đặt ngay phía trên khung để không che chữ viết tay."""
    out = img.copy()
    draw = ImageDraw.Draw(out)
    w, h = out.size
    font_size = max(14, h // 55)
    try:
        font = ImageFont.load_default(size=font_size)
    except TypeError:  # Pillow < 10.1
        font = ImageFont.load_default()
    line_w = max(2, h // 500)

    for idx, b in enumerate(boxes):
        x1, y1, x2, y2 = b["bbox"]
        px = [x1 * w / 999, y1 * h / 999, x2 * w / 999, y2 * h / 999]
        color = BOX_COLORS[idx % len(BOX_COLORS)]
        draw.rectangle(px, outline=color, width=line_w)

        label = b["box_id"]
        tb = draw.textbbox((0, 0), label, font=font)
        tw, th = tb[2] - tb[0] + 8, tb[3] - tb[1] + 6
        lx = px[0]
        ly = px[1] - th if px[1] - th >= 0 else px[1]  # sát mép trên thì đặt vào trong khung
        draw.rectangle([lx, ly, lx + tw, ly + th], fill=color)
        draw.text((lx + 4, ly + 2 - tb[1]), label, fill=(255, 255, 255), font=font)
    return out


def to_jpeg_b64(img: Image.Image, quality: int = 85) -> str:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode()


def build_prompt(boxes: List[Dict[str, Any]]) -> str:
    regions = "\n".join(f"{b['box_id']}: {b['bbox']}" for b in boxes)
    return PROMPT_TEMPLATE.format(regions=regions)


def build_schema(box_ids: List[str]) -> Dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "regions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "box_id": {"type": "string", "enum": box_ids},
                        "latex": {"type": "string"},
                    },
                    "required": ["box_id", "latex"],
                    "additionalProperties": False,
                },
            },
            "unboxed": {"type": "string"},
        },
        "required": ["regions", "unboxed"],
        "additionalProperties": False,
    }


def _parse_json(content: str) -> Dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
    return json.loads(text.strip())


def call_transcriber(image_b64: str, prompt: str, schema: Dict[str, Any], api_key: str,
                     model: str = DEFAULT_TRANSCRIBE_MODEL, attempts: int = 2) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Gọi OpenRouter; thử lại 1 lần khi lỗi 5xx / timeout / JSON hỏng. Trả về (kết quả, usage)."""
    payload = {
        "model": model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
            ],
        }],
        "response_format": {"type": "json_schema", "json_schema": {"name": "region_transcript", "strict": True, "schema": schema}},
        "temperature": 0,
        "reasoning": {"effort": "low"},
        "usage": {"include": True},
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "X-Title": "MAGR Transcriber"}
    last_err: Optional[Exception] = None
    for _ in range(attempts):
        try:
            res = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=120)
            if res.status_code >= 500:
                raise RuntimeError(f"OpenRouter HTTP {res.status_code}: {res.text[:200]}")
            if res.status_code != 200:
                # Lỗi 4xx (key sai, model không tồn tại...) thử lại cũng vô ích
                raise ValueError(f"OpenRouter HTTP {res.status_code}: {res.text[:300]}")
            data = res.json()
            content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
            return _parse_json(content), data.get("usage", {})
        except ValueError as e:
            if isinstance(e, json.JSONDecodeError):
                last_err = RuntimeError(f"Gemini trả về JSON không hợp lệ: {e}")
                continue
            raise
        except (RuntimeError, requests.RequestException) as e:
            last_err = e
    raise RuntimeError(f"Chép bài thất bại sau {attempts} lần thử: {last_err}")


def postprocess(result: Dict[str, Any], boxes: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], str]:
    """Ghép kết quả về đúng thứ tự box; vùng thiếu -> rỗng; id trùng -> nối nội dung; gắn cờ unclear."""
    by_id: Dict[str, List[str]] = {}
    for r in result.get("regions") or []:
        latex = (r.get("latex") or "").strip()
        if latex:
            by_id.setdefault(r.get("box_id"), []).append(latex)
    regions = []
    for b in boxes:
        latex = "\n".join(by_id.get(b["box_id"], []))
        regions.append({
            "box_id": b["box_id"],
            "bbox": b["bbox"],
            "type": b["type"],
            "latex": latex,
            "unclear": (not latex) or (UNREADABLE in latex),
        })
    return regions, (result.get("unboxed") or "").strip()


def build_labeled_transcript(regions: List[Dict[str, Any]], unboxed: str = "") -> str:
    """Bài làm có nhãn vùng, dùng làm input cho bước chấm điểm."""
    lines = [f"[{r['box_id']}] {r['latex']}" for r in regions if r.get("latex")]
    if unboxed:
        lines.append(f"[Ngoài vùng] {unboxed}")
    return "\n".join(lines)


def transcribe_image(image_bytes: bytes, bboxes: Optional[List[Dict[str, Any]]], api_key: str,
                     model: str = DEFAULT_TRANSCRIBE_MODEL) -> Dict[str, Any]:
    boxes = order_boxes(bboxes)
    img = draw_regions(load_image(image_bytes), boxes)
    result, usage = call_transcriber(to_jpeg_b64(img), build_prompt(boxes), build_schema([b["box_id"] for b in boxes]), api_key, model)
    regions, unboxed = postprocess(result, boxes)
    return {
        "regions": regions,
        "unboxed": unboxed,
        "model": model,
        "usage": {
            "cost": usage.get("cost"),
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
        },
    }
