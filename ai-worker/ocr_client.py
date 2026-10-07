import os
import requests
import json
from typing import Dict, Any, Optional

MODAL_OCR_URL = os.getenv(
    "MODAL_OCR_URL",
    ""
)

def perform_ocr(image_url: str, custom_id: str = "submission") -> Optional[Dict[str, Any]]:
    """
    Gửi URL ảnh bài làm tới Modal.com Serverless OCR để nhận diện chữ viết tay và công thức toán học.
    """
    if not MODAL_OCR_URL or "your-username" in MODAL_OCR_URL:
        print("[OCR Client] ⚠️ Cảnh báo: MODAL_OCR_URL chưa được cấu hình hợp lệ!")
        return None

    payload = {
        "image_url": image_url,
        "custom_id": custom_id,
        "max_length": 1024,
        "image_size": 1024,
        "base_size": 1024
    }

    print(f"[OCR Client] 🚀 Đang gửi ảnh sang Modal OCR GPU: {image_url}")
    try:
        response = requests.post(MODAL_OCR_URL, json=payload, timeout=180)
        if response.status_code == 200:
            data = response.json()
            ocr_items = data.get("ocr", [])
            infer_time = data.get("infer_time_seconds", 0)

            print(f"[OCR Client] 🎉 Nhận diện thành công trong {infer_time}s! Tìm thấy {len(ocr_items)} BBoxes.")

            # Ghép tất cả context lại thành một văn bản / chuỗi LaTeX đầy đủ phục vụ chấm bài
            full_text_lines = []
            for item in ocr_items:
                ctx = item.get("context", "").strip()
                if ctx:
                    full_text_lines.append(ctx)
            
            full_text = "\n".join(full_text_lines)

            return {
                "status": "success",
                "full_text": full_text,
                "bboxes": ocr_items,
                "infer_time_seconds": infer_time
            }
        else:
            print(f"[OCR Client] ❌ Lỗi từ Modal {response.status_code}: {response.text}")
            return {
                "status": "error",
                "error_message": f"Modal HTTP {response.status_code}: {response.text}"
            }
    except Exception as e:
        print(f"[OCR Client] ❌ Lỗi kết nối tới Modal: {e}")
        return {
            "status": "error",
            "error_message": str(e)
        }
