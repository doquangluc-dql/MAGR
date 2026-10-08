import os
import modal
from fastapi import Request
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# Kế thừa hàm OCR mà bạn đã chỉnh sửa
from ocr_client import perform_ocr

# Khởi tạo App Modal
app = modal.App("magr-ai-worker")

# Định nghĩa môi trường cho AI Worker (Chỉ cần CPU và các thư viện cơ bản)
worker_image = modal.Image.debian_slim(python_version="3.10").pip_install(
    "fastapi[standard]", "pydantic", "requests"
)

# Payload mong đợi từ Backend NestJS gửi sang
class GradingTask(BaseModel):
    submission_id: str
    image_url: Optional[str] = None
    ocr_content: Optional[str] = None
    rubric_steps: List[Dict[str, Any]] = []

# Cấu hình Secret để kéo biến môi trường từ file .env.production lên mây an toàn
env_path = os.path.join(os.path.dirname(__file__), "..", ".env.production")
try:
    my_secret = modal.Secret.from_dotenv(env_path)
    secrets_list = [my_secret]
except Exception:
    secrets_list = []

@app.function(image=worker_image, timeout=300, secrets=secrets_list)
@modal.fastapi_endpoint(method="POST")
def grade_submission(task: GradingTask) -> Dict[str, Any]:
    """
    Webhook này sẽ được NestJS gọi khi giáo viên bấm "Chấm bài".
    Nó chạy Serverless (Scale = 0 khi rảnh).
    """
    print(f"[Modal Worker] 📝 Đang nhận yêu cầu chấm bài cho submission: {task.submission_id}")

    # 1. Nếu chưa có chữ (OCR) thì gọi hàm OCR
    content = task.ocr_content
    if not content and task.image_url:
        print("[Modal Worker] ℹ️ Đang gọi Modal OCR...")
        ocr_res = perform_ocr(task.image_url, custom_id=task.submission_id)
        if ocr_res and ocr_res.get("status") == "success":
            content = ocr_res.get("full_text")

    # 2. Xử lý chấm điểm (Gọi OpenRouter)
    print(f"[Modal Worker] 🧠 Bắt đầu gọi API OpenRouter để chấm {len(task.rubric_steps)} bước barem...")
    # TODO: Thay thế code giả lập dưới đây bằng logic gọi OpenRouter thật của bạn
    earned_score = 0.0
    evaluated_steps = []

    for step in task.rubric_steps:
        # Giả lập chấm đúng
        score = float(step.get("max_score", 0.0))
        earned_score += score
        evaluated_steps.append({
            "rubric_step_id": step.get("id"),
            "is_marked_incorrect": False,
            "ai_reasoning": "OpenRouter đánh giá bước này đúng."
        })

    # 3. Thay vì trả message về RabbitMQ, ta có 2 cách:
    # Cách A: Trả thẳng kết quả HTTP response về cho NestJS (NestJS phải đợi - synchronous)
    # Cách B: Worker tự mở connection vào thẳng Neon DB PostgreSQL để update điểm (asynchronous).
    # Ở đây dùng Cách A cho đơn giản nhất:
    
    print(f"[Modal Worker] ✅ Hoàn tất chấm điểm: {earned_score} điểm.")
    return {
        "status": "success",
        "submission_id": task.submission_id,
        "total_score": earned_score,
        "steps": evaluated_steps
    }

@app.local_entrypoint()
def main():
    print("Sẵn sàng deploy AI Worker. Hãy chạy lệnh:")
    print("modal deploy ai-worker/modal_worker.py")
