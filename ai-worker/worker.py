import os
import time
import json
import random
import pika

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

def callback(ch, method, properties, body):
    try:
        print("\n=== Received new grading task ===")
        # Parse the JSON body
        body_str = body.decode('utf-8')
        body_json = json.loads(body_str)
        
        # Check if the message is wrapped in NestJS ClientProxy format
        # {"pattern": "...", "data": { ... }}
        task_data = body_json.get("data") if isinstance(body_json, dict) and "data" in body_json else body_json
        
        if not task_data or not isinstance(task_data, dict):
            print("Invalid payload format. Acknowledging and skipping.")
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return

        submission_id = task_data.get("submission_id")
        image_url = task_data.get("s3_image_url")
        rubric_steps = task_data.get("rubric_steps", [])

        print(f"Submission ID: {submission_id}")
        print(f"Image URL: {image_url}")
        print(f"Rubric steps count: {len(rubric_steps)}")

        # Simulate processing time (3 seconds)
        print("Processing OCR and grading models...")
        time.sleep(3)

        # Mock grading logic
        evaluated_steps = []
        earned_score = 0.0
        
        for step in rubric_steps:
            step_id = step.get("id")
            step_index = step.get("step_index")
            max_score = step.get("max_score", 0.0)
            latex_content = step.get("latex_content", "")

            # 30% chance to mark the step as incorrect
            is_incorrect = random.random() < 0.3
            
            if is_incorrect:
                score = 0.0
                ai_reasoning = f"Học sinh có sai sót logic hoặc áp dụng sai công thức toán tại Bước {step_index} (Barem: '{latex_content}'). Không xác định được lời giải hợp lệ."
            else:
                score = float(max_score)
                ai_reasoning = f"Học sinh giải quyết chính xác Bước {step_index} (Barem: '{latex_content}'). Tính toán và lập luận hoàn toàn hợp lệ."
                
            earned_score += score
            evaluated_steps.append({
                "rubric_step_id": step_id,
                "is_marked_incorrect": is_incorrect,
                "ai_reasoning": ai_reasoning
            })

        print(f"Grading complete. Total score calculated: {earned_score}")

        # Construct NestJS event response
        response_payload = {
            "pattern": "grading_result_event",
            "data": {
                "submission_id": submission_id,
                "total_score": earned_score,
                "steps": evaluated_steps
            }
        }

        # Publish results to RabbitMQ
        ch.basic_publish(
            exchange="",
            routing_key="grading_results",
            body=json.dumps(response_payload),
            properties=pika.BasicProperties(
                delivery_mode=2,  # make message persistent
                content_type="application/json"
            )
        )
        print("Grading results sent back to RabbitMQ (grading_results).")
        
        # Acknowledge the message
        ch.basic_ack(delivery_tag=method.delivery_tag)
        print("Message acknowledged successfully.")
        
    except Exception as e:
        print(f"Error processing task: {e}")
        # Acknowledge anyway to prevent infinite loop of bad messages in dev
        ch.basic_ack(delivery_tag=method.delivery_tag)

def main():
    connection, channel = connect_to_rabbitmq()
    
    # Set prefetch count to 1 to distribute tasks evenly among workers
    channel.basic_qos(prefetch_count=1)
    
    # Subscribe to grading_tasks queue
    channel.basic_consume(queue="grading_tasks", on_message_callback=callback)
    
    print("AI Worker is waiting for tasks. Press CTRL+C to exit.")
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        print("Stopping AI Worker...")
        channel.stop_consuming()
        connection.close()

if __name__ == "__main__":
    main()
