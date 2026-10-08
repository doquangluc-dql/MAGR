# 🏛️ MAGR - Zero-Cost Modern Cloud Architecture & Implementation Plan

Tài liệu này là bản thiết kế hệ thống (System Design) và **Kế hoạch Thực thi Chi tiết** cho dự án MAGR. Hệ thống áp dụng triết lý **"Modern Composable Serverless"** nhằm đáp ứng đầy đủ yêu cầu: có Ingress, chia tách Frontend/Backend, Auto-scale, và Infrastructure as Code (IaC) với **CHI PHÍ DUY TRÌ = $0**.

---

## 1. 🌟 Lựa chọn Công nghệ "Ngon, Bổ, Rẻ"

| Thành phần | Dịch vụ chốt | Vai trò & Lý do |
| :--- | :--- | :--- |
| **Frontend** | **Vercel** | Host code React. Cung cấp sẵn Global CDN, SSL HTTPS miễn phí, CI/CD tự động khi push Github. (Miễn phí vĩnh viễn). |
| **Backend API** | **Render** | Chạy NestJS API. Tích hợp sẵn Reverse Proxy bảo mật và HTTPS. (Gói Web Service Miễn phí). |
| **Database** | **Neon** | Serverless PostgreSQL. Tự động "ngủ" khi không có request. Miễn phí 500MB lưu trữ (dư dả cho dữ liệu điểm số, tài khoản). |
| **Lưu trữ Ảnh** | **AWS S3** | Lưu trữ ảnh bài thi gốc. Chuẩn công nghiệp, an toàn tuyệt đối. Có 5GB Free Tier năm đầu, sau đó phí siêu rẻ. |
| **AI Worker** | **Modal.com** | Serverless GPU/Compute. Scale từ 0 lên hàng trăm luồng xử lý AI song song (gọi OpenRouter). Trả tiền theo mili-giây chạy code. Loại bỏ hoàn toàn Message Queue. |

---

## 2. 🚀 Sơ đồ Kiến trúc Tổng thể

```mermaid
graph TD
    %% Khối Người dùng
    User[Người dùng]
    
    %% Khối Frontend
    subgraph "Vercel Edge Network"
        FE[Frontend React<br/>Static CDN]
        Proxy[Vercel Ingress / Proxy]
    end

    %% Khối Backend Compute
    subgraph "Render PaaS"
        BE[NestJS API Container<br/>(Tích hợp Load Balancer)]
    end
    
    %% Khối Managed Services
    subgraph "Data & Storage"
        Neon[(Neon DB<br/>Serverless PostgreSQL)]
        S3[AWS S3<br/>Lưu trữ ảnh bài thi]
    end

    %% Modal AI Worker
    subgraph "Modal.com (Serverless Compute)"
        Worker[AI Grading Function<br/>@modal.web_endpoint]
    end
    
    OpenRouter((OpenRouter API))

    %% Luồng kết nối
    User -->|1. Truy cập Web| FE
    User -->|2. Gọi API| Proxy
    Proxy -->|Route tới Backend| BE
    
    BE -->|3. Cấp Pre-signed URL| S3
    User -.->|Upload ảnh trực tiếp| S3
    BE -->|4. Lưu thông tin| Neon
    
    %% Luồng AI
    BE -->|5. Gọi Webhook Chấm bài| Worker
    Worker -->|6. Tải ảnh về| S3
    Worker -->|7. Phân tích ảnh / OCR| Worker
    Worker -->|8. Gọi API AI chấm| OpenRouter
    Worker -->|9. Cập nhật kết quả| Neon
```

---

## 3. ⚠️ Phân tích điểm nghẽn (Delay/Latency)

1. **Cold Start (Khởi động nguội):** Nếu Render hoặc Neon DB "ngủ" sau 15 phút không có người dùng, người đầu tiên truy cập lại sẽ bị khựng tầm **2-4 giây** để hệ thống bật lên.
2. **AI Cold Start:** Modal mất tầm 2-3s khởi động môi trường Python cho tấm ảnh đầu tiên. Do chạy bất đồng bộ (chấm ngầm) nên không gây giật lag web cho học sinh.
3. **Độ trễ Mạng (Network Latency):** Phải cấu hình chọn Region gần nhau (Ví dụ: `Singapore` hoặc `US-East`) cho cả AWS S3, Neon DB và Render để tránh việc truyền dữ liệu bay vòng quanh thế giới.

---

## 4. 🛠️ KẾ HOẠCH THỰC THI CHI TIẾT (IMPLEMENTATION PLAN)

Dưới đây là roadmap từng bước để biến kiến trúc trên thành hiện thực bằng **Terraform (IaC)**. 

### Bước 1: Chuẩn bị Mã Nguồn (Refactor Code)
- **Backend (NestJS):** 
  - Gỡ bỏ cấu hình kết nối tới RabbitMQ (vì không xài nữa).
  - Cập nhật logic: Khi học sinh tạo Submission thành công $\rightarrow$ Thay vì đẩy message vào RabbitMQ, gọi `axios.post('https://modal.com/your-endpoint/grade', { submission_id })`.
  - Tích hợp AWS SDK (`@aws-sdk/client-s3`) để Backend sinh *Pre-signed URL* cho Frontend upload ảnh.
- **Worker (Python):** 
  - Chuyển logic trong `ocr_client.py` thành các hàm có decorator `@modal.web_endpoint`.
  - Bổ sung logic Worker trực tiếp truy cập vào Neon DB để cập nhật trạng thái `GRADED` và điểm số.

### Bước 2: Viết mã Hạ tầng Terraform (IaC)
Tạo thư mục `infrastructure/` với cấu trúc:
```text
infrastructure/
├── main.tf
├── providers.tf       # Khai báo Render, AWS, Neon, Vercel providers
└── variables.tf
```
*Code mẫu tạo Database bằng Terraform (trong main.tf):*
```hcl
resource "neon_project" "magr_db" {
  name       = "magr-production"
  history_retention_seconds = 86400
}
```

### Bước 3: Triển khai (Deployment)
1. **Khởi tạo Infra:** Chạy `terraform init` và `terraform apply`. Lấy ra chuỗi kết nối của Neon DB và khóa bí mật của AWS S3.
2. **Deploy Modal Worker:** Vào thư mục worker, chạy lệnh `modal deploy ocr_client.py`. (Lấy endpoint URL của Modal để dán vào biến môi trường của Render).
3. **Deploy Backend lên Render:** Cập nhật file `.env` trên Render với `DATABASE_URL` từ Neon và `MODAL_API_URL` từ Modal.
4. **Deploy Frontend lên Vercel:** Liên kết Vercel với Github Repo. Chỉnh biến `VITE_API_URL` trỏ về domain của Render.

### Bước 4: Kiểm thử Toàn bộ Hệ thống (E2E Testing)
- Học sinh nộp bài thử $\rightarrow$ Ảnh lên S3 $\rightarrow$ Neon lưu DB $\rightarrow$ Modal kích hoạt $\rightarrow$ Điểm báo về màn hình (Success!).
