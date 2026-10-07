import os
import time
import json
import random
import pika
from ocr_client import perform_ocr

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://admin:adminpassword@rabbitmq:5672")

def connect_to_rabbitmq():
    """Connect to RabbitMQ with a retry loop to allow RabbitMQ to boot up first."""
    parameters = pika.URLParameters(RABBITMQ_URL)
    while True:
        try:
            print(f"Connecting to RabbitMQ at {RABBITMQ_URL}...")
            connection = pika.BlockingConnection(parameters)
            channel = connection.channel()
            
            # Declare queues to ensure they exist
            channel.queue_declare(queue="grading_tasks", durable=True)
            channel.queue_declare(queue="grading_results", durable=True)
            
            print("Successfully connected to RabbitMQ.")
            return connection, channel
        except pika.exceptions.AMQPConnectionError as e:
            print(f"Connection failed ({e}). Retrying in 5 seconds...")
            time.sleep(5)

def handle_ocr_task(ch, submission_id: str, image_url: str):
    """Xử lý task OCR ngay khi học sinh vừa nộp bài"""
    print(f"\n[Worker] 📸 Đang xử lý OCR cho submission: {submission_id}")
    print(f"[Worker] 🔗 Image URL: {image_url}")

    ocr_result = perform_ocr(image_url, custom_id=submission_id)
    if not ocr_result or ocr_result.get("status") != "success":
        print(f"[Worker] ❌ OCR thất bại cho submission {submission_id}")
        response_payload = {
            "pattern": "ocr_result_event",
            "data": {
                "submission_id": submission_id,
                "status": "error",
                "ocr_content": None,
                "ocr_bboxes": None
            }
        }
    else:
        print(f"[Worker] ✅ OCR thành công! Tìm thấy {len(ocr_result.get('bboxes', []))} BBoxes.")
        response_payload = {
            "pattern": "ocr_result_event",
            "data": {
                "submission_id": submission_id,
                "status": "success",
                "ocr_content": ocr_result.get("full_text"),
                "ocr_bboxes": ocr_result.get("bboxes"),
                "infer_time_seconds": ocr_result.get("infer_time_seconds", 0)
            }
        }

    # Bắn kết quả OCR về NestJS Backend
    ch.basic_publish(
        exchange="",
        routing_key="grading_results",
        body=json.dumps(response_payload),
        properties=pika.BasicProperties(
            delivery_mode=2,
            content_type="application/json"
        )
    )
    print(f"[Worker] 📤 Đã gửi kết quả OCR (ocr_result_event) về backend.")

def handle_grading_task(ch, task_data: dict):
    """Xử lý task chấm điểm khi giáo viên bấm Chấm bài"""
    submission_id = task_data.get("submission_id")
    image_url = task_data.get("s3_image_url")
    ocr_content = task_data.get("ocr_content")
    rubric_steps = task_data.get("rubric_steps", [])

    print(f"\n[Worker] 📝 Đang chấm bài cho submission: {submission_id}")
    print(f"[Worker] 📑 Số bước Barem: {len(rubric_steps)}")

    # Nếu bài chưa được OCR trước đó, fallback gọi OCR ngay tại đây
    if not ocr_content and image_url:
        print("[Worker] ℹ️ Bài nộp chưa có sẵn OCR content. Đang chạy OCR fallback...")
        ocr_res = perform_ocr(image_url, custom_id=submission_id)
        if ocr_res and ocr_res.get("status") == "success":
            ocr_content = ocr_res.get("full_text")

    # Mock grading logic (placeholder cho thuật toán chấm sau này của bạn)
    evaluated_steps = []
    earned_score = 0.0

    for step in rubric_steps:
        step_id = step.get("id")
        step_index = step.get("step_index")
        max_score = step.get("max_score", 0.0)
        latex_content = step.get("latex_content", "")

        is_incorrect = random.random() < 0.25  # Giả lập 25% tỷ lệ học sinh làm sai
        if is_incorrect:
            score = 0.0
            ai_reasoning = f"Học sinh có sai sót tại Bước {step_index} (Barem: '{latex_content}')."
        else:
            score = float(max_score)
            ai_reasoning = f"Học sinh làm đúng Bước {step_index} (Barem: '{latex_content}')."

        earned_score += score
        evaluated_steps.append({
            "rubric_step_id": step_id,
            "is_marked_incorrect": is_incorrect,
            "ai_reasoning": ai_reasoning
        })

    print(f"[Worker] 🏆 Chấm xong submission {submission_id}. Tổng điểm: {earned_score}")

    response_payload = {
        "pattern": "grading_result_event",
        "data": {
            "submission_id": submission_id,
            "total_score": earned_score,
            "steps": evaluated_steps
        }
    }

    ch.basic_publish(
        exchange="",
        routing_key="grading_results",
        body=json.dumps(response_payload),
        properties=pika.BasicProperties(
            delivery_mode=2,
            content_type="application/json"
        )
    )
    print("[Worker] 📤 Đã gửi kết quả chấm bài (grading_result_event) về backend.")

def callback(ch, method, properties, body):
    try:
        body_str = body.decode('utf-8')
        body_json = json.loads(body_str)

        pattern = body_json.get("pattern", "grading_task_event")
        task_data = body_json.get("data") if isinstance(body_json, dict) and "data" in body_json else body_json

        if not task_data or not isinstance(task_data, dict):
            print("[Worker] ⚠️ Invalid payload format. Skipping.")
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return

        # Phân luồng công việc theo pattern
        if pattern == "ocr_task_event":
            submission_id = task_data.get("submission_id")
            image_url = task_data.get("image_url")
            if submission_id and image_url:
                handle_ocr_task(ch, submission_id, image_url)
        else:
            # Mặc định là grading_task_event
            handle_grading_task(ch, task_data)

        ch.basic_ack(delivery_tag=method.delivery_tag)

    except Exception as e:
        print(f"[Worker] ❌ Lỗi xử lý message: {e}")
        ch.basic_ack(delivery_tag=method.delivery_tag)

def main():
    connection, channel = connect_to_rabbitmq()
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue="grading_tasks", on_message_callback=callback)

    print("AI Worker is running and listening for OCR & grading tasks. Press CTRL+C to exit.")
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        print("Stopping AI Worker...")
        channel.stop_consuming()
        connection.close()

if __name__ == "__main__":
    main()
