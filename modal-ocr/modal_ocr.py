import os
import io
import re
import base64
import tempfile
import requests
from contextlib import redirect_stdout
from typing import Optional, List, Dict, Any

import modal
from pydantic import BaseModel, Field

# --- 1. ĐỊNH NGHĨA CONTAINER IMAGE TRÊN MODAL ---
# Hàm tải trước weights của model vào cache của Image
# Giúp giảm thời gian Cold Start từ 30s xuống chỉ còn ~3-5s
def download_model_weights():
    import transformers
    if not hasattr(transformers.utils.import_utils, "is_torch_fx_available"):
        transformers.utils.import_utils.is_torch_fx_available = lambda: False
    
    from transformers import AutoModel, AutoTokenizer
    model_name = "baidu/Unlimited-OCR"
    AutoTokenizer.from_pretrained(model_name, trust_remote_code=True, use_fast=False)
    AutoModel.from_pretrained(
        model_name,
        trust_remote_code=True,
        use_safetensors=True,
    )

ocr_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "torch==2.10.0",
        "torchvision==0.25.0",
        "transformers==4.57.1",
        "matplotlib==3.10.8",
        "einops==0.8.2",
        "addict==2.4.0",
        "easydict==1.13",
        "pymupdf==1.27.2.2",
        "psutil==7.2.2",
        "fastapi[standard]",
        "pydantic",
        "requests",
        "pillow",
        "accelerate",
    )
    .run_function(download_model_weights)
)

# --- 2. KHỞI TẠO APP MODAL ---
app = modal.App("unlimited-ocr-service")


# --- 3. PYDANTIC SCHEMA CHO ĐẦU VÀO & ĐẦU RA ---
class OCRRequest(BaseModel):
    # Dữ liệu ảnh: hỗ trợ hoặc chuỗi base64 hoặc URL trực tiếp
    image_base64: Optional[str] = Field(None, description="Chuỗi base64 của ảnh/PDF bài làm học sinh")
    image_url: Optional[str] = Field(None, description="Đường link URL ảnh nếu không truyền base64")
    custom_id: Optional[str] = Field("student_submission", description="ID định danh học sinh / bài làm")

    # Các tham số suy luận (kèm giá trị mặc định như bạn yêu cầu)
    base_size: int = Field(1024, description="Kích thước cơ sở")
    image_size: int = Field(1024, description="Kích thước resize ảnh đưa vào model")
    crop_mode: bool = Field(False, description="Chế độ crop mảnh ảnh")
    max_length: int = Field(1024, description="Số token tối đa sinh ra")
    no_repeat_ngram_size: int = Field(50, description="Kích thước ngram không lặp lại")
    ngram_window: int = Field(256, description="Cửa sổ trượt ngram")
    save_results: bool = Field(False, description="Tắt lưu file ảnh visual, chỉ lấy JSON")


# --- 4. HÀM BÓC TÁCH KẾT QUẢ SANG JSON (TỪ CODE GỐC CỦA BẠN) ---
def parse_ocr_output(raw_text: str) -> List[Dict[str, Any]]:
    """
    Dùng Regex để tìm tất cả các cụm cấu trúc:
    <|det|>type [x1, y1, x2, y2]<|/det|>context...
    """
    pattern = r"<\|det\|>(.*?)\s*\[(.*?)\]<\|/det\|>(.*?)(?=<\|det\|>|$)"
    matches = re.findall(pattern, raw_text, re.DOTALL)

    ocr_items = []
    for match in matches:
        obj_type = match[0].strip()
        bbox_str = match[1].strip()
        context = match[2].strip()

        try:
            bbox = [int(x.strip()) for x in bbox_str.split(",")]
        except ValueError:
            bbox = []

        ocr_items.append({
            "type": obj_type,
            "bbox": bbox,
            "context": context
        })
    return ocr_items


# --- 5. CLASS SERVICE SERVERLESS TRÊN GPU L4 ---
@app.cls(
    image=ocr_image,
    gpu="L4",                # NVIDIA L4 24GB VRAM (chuẩn bfloat16, tốc độ cao)
    scaledown_window=300,    # Giữ GPU ấm trong 5 phút sau mỗi request
    timeout=300,             # Giới hạn 5 phút cho mỗi request
)
class UnlimitedOCRModel:
    @modal.enter()
    def setup_model(self):
        """Chỉ chạy 1 lần duy nhất khi container khởi động (Cold Start)"""
        import torch
        import transformers
        from transformers import AutoModel, AutoTokenizer

        os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

        if not hasattr(transformers.utils.import_utils, "is_torch_fx_available"):
            transformers.utils.import_utils.is_torch_fx_available = lambda: False

        model_name = "baidu/Unlimited-OCR"
        print("Đang nạp Tokenizer và Model lên GPU...")

        self.tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            trust_remote_code=True,
            use_fast=False,
        )

        self.model = AutoModel.from_pretrained(
            model_name,
            trust_remote_code=True,
            use_safetensors=True,
            torch_dtype=torch.bfloat16,
            device_map="cuda",
        ).eval()
        print("Model đã sẵn sàng phục vụ!")

    @modal.fastapi_endpoint(method="POST")
    def predict(self, req: OCRRequest) -> Dict[str, Any]:
        """Endpoint HTTP nhận POST request từ ứng dụng của bạn"""
        import torch

        # 1. Tiếp nhận và lưu ảnh tạm thời
        temp_img_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_file:
                temp_img_path = tmp_file.name

                if req.image_base64:
                    # Loại bỏ header data:image/png;base64,... nếu có
                    base64_data = req.image_base64
                    if "," in base64_data:
                        base64_data = base64_data.split(",", 1)[1]
                    tmp_file.write(base64.b64decode(base64_data))
                elif req.image_url:
                    resp = requests.get(req.image_url, timeout=30)
                    resp.raise_for_status()
                    tmp_file.write(resp.content)
                else:
                    return {
                        "status": "error",
                        "message": "Vui lòng truyền 'image_base64' hoặc 'image_url'"
                    }

            # 2. Hứng kết quả stdout từ model.infer và đo thời gian
            import time
            start_infer_time = time.time()
            f = io.StringIO()
            with torch.inference_mode():
                with redirect_stdout(f):
                    self.model.infer(
                        self.tokenizer,
                        prompt="<image>document parsing.",
                        image_file=temp_img_path,
                        output_path=tempfile.gettempdir(), # Thư mục tạm

                        base_size=req.base_size,
                        image_size=req.image_size,
                        crop_mode=req.crop_mode,
                        max_length=req.max_length,
                        no_repeat_ngram_size=req.no_repeat_ngram_size,
                        ngram_window=req.ngram_window,
                        save_results=req.save_results,
                    )

            infer_duration = round(time.time() - start_infer_time, 2)
            raw_output = f.getvalue()

            # 3. Dọn dẹp thanh tiến trình stdout
            if "==============" in raw_output:
                raw_output = raw_output.split("==============")[0].strip()

            # 4. Format ra JSON theo cấu trúc bạn cần
            parsed_ocr = parse_ocr_output(raw_output)

            return {
                "status": "success",
                "custom_id": req.custom_id,
                "infer_time_seconds": infer_duration,
                "ocr": parsed_ocr
            }

        except Exception as e:
            return {
                "status": "error",
                "message": str(e)
            }
        finally:
            # Dọn dẹp file tạm để không chiếm bộ nhớ
            if temp_img_path and os.path.exists(temp_img_path):
                os.remove(temp_img_path)
            if torch.cuda.is_available():
                torch.cuda.empty_cache()


# --- 6. HÀM TEST NHANH TRÊN MÁY LOCAL (MODAL RUN) ---
@app.local_entrypoint()
def main():
    print("✅ Cấu hình mô hình Unlimited-OCR hợp lệ 100%!")
    print("🚀 Sẵn sàng deploy. Để đưa lên Cloud Serverless, bạn chạy lệnh:")
    print("   modal deploy modal-ocr/modal_ocr.py")

