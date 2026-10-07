# Modal Serverless OCR Service (Baidu Unlimited-OCR)

Dịch vụ Serverless OCR chuyên dụng cho bài toán nhận diện chữ viết tay và công thức toán học (LaTeX) từ ảnh bài làm của học sinh. Chạy trên GPU NVIDIA L4 Serverless của Modal.com.

## Cấu trúc thư mục
- `modal_ocr.py`: Định nghĩa Modal App, Image Container tải model weights từ Hugging Face (`baidu/Unlimited-OCR`), class `UnlimitedOCRModel` và web endpoint FastAPI `@app.function(...) @modal.fastapi_endpoint()`.
- `client_test.py`: Script kiểm thử trực tiếp gửi ảnh đến Webhook URL và hiển thị thời gian chạy + kết quả bounding box.
- `requirements.txt`: Các thư viện local cần thiết (`modal`, `pillow`, `requests`, `fastapi`, `pydantic`).

## Triển khai (Deploy)
1. Kích hoạt môi trường ảo:
   ```bash
   source .venv/bin/activate
   ```
2. Đăng nhập Modal (nếu chưa đăng nhập):
   ```bash
   modal token new
   ```
3. Deploy lên Modal Cloud:
   ```bash
   modal deploy modal_ocr.py
   ```
4. Sau khi deploy thành công, Modal sẽ cấp Webhook URL dạng:
   `https://<username>--unlimited-ocr-service-unlimitedocrmodel-predict.modal.run`
5. Cập nhật URL này vào biến môi trường `MODAL_OCR_URL` trong file `.env.production` của hệ thống MAGR.

