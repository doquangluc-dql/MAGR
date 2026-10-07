import os
import sys
import json
import base64
import requests

# Thay bằng URL mà lệnh `modal deploy modal-ocr/modal_ocr.py` trả về cho bạn
# Hoặc set biến môi trường: export MODAL_OCR_URL="https://..."
MODAL_API_URL = os.getenv("MODAL_OCR_URL", "https://<your-username>--unlimited-ocr-service-unlimitedocrmodel-predict.modal.run")

def create_sample_math_image(output_path: str = "sample_math.png") -> str:
    """Tạo nhanh một ảnh công thức toán học mẫu để test nếu người dùng chưa có sẵn ảnh"""
    from PIL import Image, ImageDraw, ImageFont
    
    # Tạo ảnh trắng 800x400
    img = Image.new("RGB", (800, 400), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    
    # Viết bài làm toán mẫu
    lines = [
        "Bai lam cua hoc sinh:",
        "Cau 1: Giai phuong trinh bac hai:",
        "x^2 - 5x + 6 = 0",
        "Delta = (-5)^2 - 4 * 1 * 6 = 25 - 24 = 1 > 0",
        "Phuong trinh co 2 nghiem phan biet:",
        "x1 = (5 + 1) / 2 = 3",
        "x2 = (5 - 1) / 2 = 2"
    ]
    
    y = 30
    for line in lines:
        draw.text((40, y), line, fill=(0, 0, 0))
        y += 45
        
    img.save(output_path)
    print(f"📝 Đã tự động tạo ảnh bài toán mẫu tại: {output_path}")
    return output_path

def run_ocr(image_source: str, custom_id: str = "student_test_01", **custom_params):
    """
    Gửi ảnh lên Modal OCR Service.
    image_source: đường dẫn file ảnh (vd: anh.png) HOẶC đường link URL (https://...)
    """
    if "your-username" in MODAL_API_URL:
        print("\n" + "!"*60)
        print("❌ LỖI: Bạn chưa cập nhật MODAL_API_URL!")
        print("👉 Hãy mở file 'modal-ocr/client_test.py' (dòng 8) và dán URL")
        print("   mà lệnh `modal deploy` đã in ra ở bước trước.")
        print("!"*60 + "\n")
        return None

    payload = {
        "custom_id": custom_id,
        **custom_params
    }

    # Trường hợp 1: Truyền link URL ảnh online
    if image_source.startswith("http://") or image_source.startswith("https://"):
        print(f"🌐 Đang gửi URL ảnh online: {image_source}")
        payload["image_url"] = image_source
    # Trường hợp 2: Truyền file ảnh cục bộ
    else:
        if not os.path.exists(image_source):
            print(f"❌ Không tìm thấy file ảnh tại: {image_source}")
            return None
        print(f"📁 Đang đọc và mã hóa Base64 ảnh: {image_source} ...")
        with open(image_source, "rb") as f:
            payload["image_base64"] = base64.b64encode(f.read()).decode("utf-8")

    import time
    start_rtt = time.time()
    print(f"🚀 Đang gửi request tới Modal OCR GPU...")
    try:
        response = requests.post(MODAL_API_URL, json=payload, timeout=120)
        total_rtt = round(time.time() - start_rtt, 2)
        if response.status_code == 200:
            result = response.json()
            ocr_items = result.get("ocr", [])
            infer_time = result.get("infer_time_seconds", "N/A")
            print("\n" + "="*60)
            print("🎉 KẾT QUẢ OCR THÀNH CÔNG VƯỢT TRỘI!")
            print(f"📌 Mã định danh: {result.get('custom_id')}")
            print(f"⚡ Thời gian Model GPU xử lý (Inference): {infer_time} giây")
            print(f"⏱️ Tổng thời gian toàn trình (cả mạng): {total_rtt} giây")
            print(f"📊 Tổng số vùng nhận diện được (BBoxes): {len(ocr_items)}")
            print("="*60)
            for idx, item in enumerate(ocr_items, 1):
                bbox = item.get("bbox", [])
                obj_type = item.get("type", "text")
                context = item.get("context", "")
                print(f"[{idx:02d}] Loại: {obj_type:<10} | BBox: {bbox}")
                print(f"     Nội dung: {context}")
            print("="*60 + "\n")
            return result
        else:
            print(f"❌ Lỗi từ Modal {response.status_code}: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Lỗi kết nối tới Modal: {e}")
        return None

if __name__ == "__main__":
    # 1. Nếu người dùng truyền đường dẫn ảnh qua tham số dòng lệnh:
    # Ví dụ: python modal-ocr/client_test.py duong_dan_anh.png
    if len(sys.argv) > 1:
        target_image = sys.argv[1]
    else:
        # 2. Nếu không truyền gì, kiểm tra nếu chưa có ảnh thì tự tạo ảnh bài toán mẫu
        sample_img = "sample_math.png"
        if not os.path.exists(sample_img):
            create_sample_math_image(sample_img)
        target_image = sample_img

    run_ocr(target_image, custom_id="student_submission_test")
