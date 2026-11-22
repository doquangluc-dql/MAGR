import os
import json
import requests
import modal
from fastapi import Request
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# Kế thừa hàm OCR mà bạn đã chỉnh sửa
from ocr_client import perform_ocr
from transcriber import DEFAULT_TRANSCRIBE_MODEL, transcribe_image

# Khởi tạo App Modal
app = modal.App("magr-ai-worker")

# Định nghĩa môi trường cho AI Worker (Chỉ cần CPU và các thư viện cơ bản)
worker_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install("fastapi[standard]", "pydantic", "requests", "pillow")
    # Modal >= 1.0 không còn tự mount các module local; phải thêm các module này vào image
    .add_local_python_source("ocr_client", "transcriber")
)

# Payload mong đợi từ Backend NestJS gửi sang
class GradingTask(BaseModel):
    submission_id: str
    image_url: Optional[str] = None
    s3_image_url: Optional[str] = None
    ocr_content: Optional[str] = None
    problem_description: Optional[str] = ""
    rubric_steps: List[Dict[str, Any]] = []

# Payload chép bài (backend gửi khi giáo viên bấm chấm)
class TranscribeTask(BaseModel):
    submission_id: str
    image_url: str
    bboxes: Optional[List[Dict[str, Any]]] = None  # box Unlimited-OCR có sẵn; thiếu thì worker tự gọi OCR

# Cấu hình Secret để kéo biến môi trường từ file .env.production lên mây an toàn
env_path = os.path.join(os.path.dirname(__file__), "..", ".env.production")
try:
    my_secret = modal.Secret.from_dotenv(env_path)
    secrets_list = [my_secret]
except Exception:
    secrets_list = []

DEFAULT_MODEL = "google/gemma-4-31b-it"

def call_openrouter(prompt: str, schema: dict, api_key: str, model: str = DEFAULT_MODEL) -> dict:
    """
    Gọi OpenRouter API với Structured Outputs (json_schema) để chấm điểm từng bước.
    """
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://magr.ai",
        "X-Title": "MAGR Math Grader",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "math_step_evaluations",
                "strict": True,
                "schema": schema
            }
        },
        "temperature": 0.1
    }

    response = requests.post(url, headers=headers, json=payload, timeout=120)
    if response.status_code != 200:
        raise RuntimeError(f"OpenRouter API error ({response.status_code}): {response.text}")

    data = response.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError(f"OpenRouter không trả về choices: {data}")

    message_content = choices[0].get("message", {}).get("content", "").strip()
    if not message_content:
        raise RuntimeError("OpenRouter trả về nội dung rỗng.")

    # Xử lý nếu mô hình bao bọc trong markdown code fence
    cleaned_content = message_content
    if cleaned_content.startswith("```json"):
        cleaned_content = cleaned_content[7:]
    elif cleaned_content.startswith("```"):
        cleaned_content = cleaned_content[3:]
    if cleaned_content.endswith("```"):
        cleaned_content = cleaned_content[:-3]
    cleaned_content = cleaned_content.strip()

    try:
        return json.loads(cleaned_content)
    except json.JSONDecodeError as err:
        raise RuntimeError(f"Không thể parse JSON từ phản hồi của OpenRouter: {err}. Phản hồi thô: {cleaned_content[:200]}")

# Alias call_gemma để tương thích với tên gọi của user
call_gemma = call_openrouter

@app.function(image=worker_image, timeout=300, secrets=secrets_list)
@modal.fastapi_endpoint(method="POST")
def grade_submission(task: GradingTask) -> Dict[str, Any]:
    """
    Webhook này sẽ được NestJS gọi khi giáo viên bấm "Chấm bài".
    Nó chạy Serverless (Scale = 0 khi rảnh).
    """
    print(f"[Modal Worker] 📝 Đang nhận yêu cầu chấm bài cho submission: {task.submission_id}")

    try:
        # 1. Lấy API key từ biến môi trường
        api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("API_KEY")
        if not api_key:
            raise ValueError("Thiếu biến môi trường OPENROUTER_API_KEY hoặc API_KEY trên server.")

        # 2. Nếu chưa có chữ (OCR) thì gọi hàm OCR
        content = task.ocr_content
        image_url = task.s3_image_url or task.image_url
        ocr_error = None
        if not content and image_url:
            print("[Modal Worker] ℹ️ Đang gọi Modal OCR...")
            ocr_res = perform_ocr(image_url, custom_id=task.submission_id)
            if ocr_res and ocr_res.get("status") == "success":
                content = ocr_res.get("full_text")
            elif ocr_res:
                ocr_error = ocr_res.get("error_message")
            else:
                ocr_error = "MODAL_OCR_URL chưa được cấu hình trên worker"

        # Không chấm khi không có nội dung bài làm: chấm một chuỗi rỗng sẽ cho 0 điểm
        # và khiến giáo viên tưởng học sinh làm sai hết.
        if not content or not content.strip():
            if ocr_error:
                raise RuntimeError(f"OCR thất bại, không thể chấm bài: {ocr_error}")
            if not image_url:
                raise RuntimeError("Bài nộp không có ảnh và không có nội dung OCR.")
            raise RuntimeError("OCR không nhận diện được chữ nào trong ảnh bài làm.")

        # 3. Chuẩn bị teacher_barem từ task.rubric_steps
        teacher_barem = []
        for idx, step in enumerate(task.rubric_steps):
            step_num = idx + 1
            latex_content = step.get("latex_content", "")
            teacher_barem.append(f"T{step_num}: {latex_content}")

        problem_description = task.problem_description or "Math Problem"

        # 4. Tạo prompt và gọi OpenRouter
        prompt = grading_prompt(teacher_barem, content, problem_description)
        selected_model = os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL)
        print(f"[Modal Worker] 🧠 Bắt đầu gọi API OpenRouter ({selected_model}) để chấm {len(task.rubric_steps)} bước barem...")

        parsed_result = call_openrouter(prompt, json_schema, api_key, model=selected_model)

        # 5. Phân tích kết quả từ model
        step_evals = parsed_result.get("step_evaluations", [])
        eval_dict = {}
        for ev in step_evals:
            tid = str(ev.get("teacher_step_id", "")).strip().lower()
            eval_dict[tid] = ev

        evaluated_steps = []
        earned_score = 0.0

        for idx, step in enumerate(task.rubric_steps):
            step_id = step.get("id")
            step_idx = step.get("step_index", idx + 1)
            max_score = float(step.get("max_score", 0.0))

            t_key_label = f"t{idx + 1}"
            t_key_num = str(idx + 1)
            t_key_step_idx = f"t{step_idx}".lower()
            t_key_step_num = str(step_idx)

            matched_eval = (
                eval_dict.get(t_key_label) or
                eval_dict.get(t_key_num) or
                eval_dict.get(t_key_step_idx) or
                eval_dict.get(t_key_step_num)
            )

            if matched_eval:
                # bool("false") == True, nên phải xử lý cả trường hợp model trả về chuỗi
                raw_correct = matched_eval.get("is_correct", False)
                if isinstance(raw_correct, str):
                    is_correct = raw_correct.strip().lower() == "true"
                else:
                    is_correct = raw_correct is True
                reasoning = matched_eval.get("reasoning", "")
                is_marked_incorrect = not is_correct
                if is_correct:
                    earned_score += max_score
            else:
                is_marked_incorrect = True
                reasoning = "Mô hình không trả về đánh giá cho bước này."

            evaluated_steps.append({
                "rubric_step_id": step_id,
                "is_marked_incorrect": is_marked_incorrect,
                "ai_reasoning": reasoning
            })

        earned_score = round(earned_score, 2)
        print(f"[Modal Worker] ✅ Hoàn tất chấm điểm submission {task.submission_id}: {earned_score} điểm.")
        return {
            "status": "success",
            "submission_id": task.submission_id,
            "total_score": earned_score,
            "steps": evaluated_steps
        }

    except Exception as e:
        error_msg = str(e)
        print(f"[Modal Worker] ❌ Lỗi chấm bài cho submission {task.submission_id}: {error_msg}")
        return {
            "status": "error",
            "submission_id": task.submission_id,
            "error_message": error_msg,
            "total_score": 0.0,
            "steps": []
        }

@app.function(image=worker_image, timeout=300, secrets=secrets_list)
@modal.fastapi_endpoint(method="POST")
def transcribe_submission(task: TranscribeTask) -> Dict[str, Any]:
    """
    Chép bài làm theo từng vùng box của Unlimited-OCR bằng Gemini (OPENROUTER_TRANSCRIBE_MODEL).
    Trả về regions [{box_id, bbox, type, latex, unclear}] để backend lưu và tái sử dụng.
    """
    print(f"[Transcriber] 📝 Chép bài cho submission: {task.submission_id}")
    try:
        api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("API_KEY")
        if not api_key:
            raise ValueError("Thiếu biến môi trường OPENROUTER_API_KEY trên server.")
        model = os.getenv("OPENROUTER_TRANSCRIBE_MODEL") or DEFAULT_TRANSCRIBE_MODEL

        # 1. Box: dùng box có sẵn, nếu chưa có thì gọi Unlimited-OCR để lấy
        bboxes = task.bboxes
        ocr_note = None
        if not bboxes:
            print("[Transcriber] ℹ️ Chưa có box, gọi Modal OCR...")
            ocr_res = perform_ocr(task.image_url, custom_id=task.submission_id)
            if ocr_res and ocr_res.get("status") == "success" and ocr_res.get("bboxes"):
                bboxes = ocr_res["bboxes"]
            else:
                ocr_note = (ocr_res or {}).get("error_message") or "OCR không trả về box"
                print(f"[Transcriber] ⚠️ Không lấy được box ({ocr_note}), chép cả trang thành một vùng.")

        # 2. Tải ảnh và chép theo vùng
        img_res = requests.get(task.image_url, timeout=60)
        img_res.raise_for_status()
        result = transcribe_image(img_res.content, bboxes, api_key, model)

        cost = result["usage"].get("cost")
        print(f"[Transcriber] ✅ Xong {len(result['regions'])} vùng, chi phí ${cost}")
        return {
            "status": "success",
            "submission_id": task.submission_id,
            "image_url": task.image_url,
            "ocr_bboxes": bboxes,  # trả lại để backend lưu nếu worker vừa tự gọi OCR
            "ocr_note": ocr_note,
            **result,
        }
    except Exception as e:
        print(f"[Transcriber] ❌ Lỗi chép bài {task.submission_id}: {e}")
        return {"status": "error", "submission_id": task.submission_id, "error_message": str(e)}

@app.local_entrypoint()
def main():
    print("Sẵn sàng deploy AI Worker. Hãy chạy lệnh:")
    print("modal deploy ai-worker/modal_worker.py")

def grading_prompt(teacher_barem, student_solution, problem_description):
    # Chuyển teacher_barem dạng list thành chuỗi JSON đẹp để đưa vào prompt
    str_teacher_barem = json.dumps(teacher_barem, ensure_ascii=False, indent=2)
    
    GRADING_PROMPT = f"""You are an expert Math Grader using a structured evaluation approach.
You are provided with:
1. "Problem Description": The original math question.
2. "Teacher Barem": A list of standard solution steps from the teacher. Each step starts with an ID (e.g., "T1:", "T2:").
3. "Student Solution": The full, raw text of the student's submitted answer.

Task: Iterate through EACH step in the "Teacher Barem". For every teacher step, search the "Student Solution" to find if the student has fulfilled that specific step's requirement. Evaluate the student's work based on the "Problem Description" and the teacher's steps.

1. Check Existence: If the student completely skipped the logic/calculation required by a specific teacher step, mark `is_correct: false` (Reason: "Step missing or skipped in student solution").

2. Check Correctness: If the student's solution contains work corresponding to the teacher step, verify if the content accurately satisfies the mathematical requirement. Apply the following rules STRICTLY:

   A. Mathematical Terminology (Equivalent vs. Distinct):
      - ALLOW: Synonyms or alternative terms that have the EXACT same mathematical definition. 
        (e.g., "Slope" vs. "Gradient", "GCD" vs. "HCF", "Roots" vs. "Solutions"). Mark `is_correct: true` for these cases.
      - REJECT: Terms that refer to fundamentally distinct concepts, even if related. 
        (e.g., "Direction Ratios" is NOT "Direction Cosines"; "Permutation" is NOT "Combination"; "Average" is NOT "Median"). Mark `is_correct: false` if the student swaps these specific terms.

   B. Variable Usage Context:
      - Case 1: Specific Entities (Strict). If variables represent specific physical quantities (e.g., "Let v be velocity") or specific geometric labels defined in the Problem Description (e.g., "Triangle ABC"), the student MUST use these exact variables. Changing specific entities (e.g., ABC -> XYZ) is incorrect.
      - Case 2: Dummy Variables & Functional Notation (Flexible). If the variable is merely a placeholder for a function's argument (Dummy Variable) or a generic unknown in an equation (e.g., f(x) vs f(t)), variable substitution is ALLOWED provided the logic remains consistent.

   C. Logic and Calculation:
      - Verify the calculation steps are error-free.
      - Ensure the logic flows correctly according to the teacher's method.
      - Mark `is_correct: true` ONLY if logic, calculations, and rules A & B are satisfied.

Output ONLY a valid JSON object containing the `step_evaluations` array and nothing else.

--- FEW-SHOT EXAMPLES (Study these carefully) ---

Example 1: Dummy Variable Substitution (Allowed - Rule B, Case 2)
Input Problem: "Let f(x) = x^2 + 1, g(x) = 2x - 1. Find f(x) + g(x)."
Teacher Barem: 
[
  "T1: Add the two functions: (f+g)(x) = x^2 + 2x"
]
Student Solution: "First, I define the sum. (f+g)(t) = t^2 + 2t."
Example Output:
{{
  "step_evaluations": [
    {{
        "teacher_step_id": "T1",
        "is_correct": true,
        "reasoning": "Correct. The student successfully added the functions and used 't' as a dummy variable instead of 'x'. This is mathematically equivalent in functional notation."
    }}
  ]
}}

Example 2: Incorrect Terminology (Rejected - Rule A) & Missing Step
Input Problem: "Find the direction cosines of the line."
Teacher Barem: 
[
  "T1: The formula for direction cosines requires finding the magnitude first.",
  "T2: The direction cosines are l, m, n..."
]
Student Solution: "The direction ratios are a, b, c..."
Example Output:
{{
  "step_evaluations": [
    {{
        "teacher_step_id": "T1",
        "is_correct": false,
        "reasoning": "Step missing. The student did not attempt to find the magnitude."
    }},
    {{
        "teacher_step_id": "T2",
        "is_correct": false,
        "reasoning": "Incorrect concept. The student calculated 'direction ratios', but the problem and teacher step specifically required 'direction cosines'."
    }}
  ]
}}

Example 3: Specific Entity Error (Strict Variable - Rule B, Case 1)
Input Problem: "In triangle ABC, angle A is 90 degrees."
Teacher Barem: 
[
  "T1: In triangle ABC, apply Pythagorean theorem..."
]
Student Solution: "In triangle PQR, apply Pythagorean theorem..."
Example Output:
{{
  "step_evaluations": [
    {{
        "teacher_step_id": "T1",
        "is_correct": false,
        "reasoning": "Incorrect variable usage. The problem explicitly defined Triangle ABC, but the student arbitrarily changed it to Triangle PQR."
    }}
  ]
}}
--- END OF EXAMPLES ---

Now process the real data below.

--- Problem Description ---
{problem_description}

--- Teacher Barem ---
{str_teacher_barem}

--- Student Solution ---
{student_solution}
"""
    return GRADING_PROMPT

json_schema = {
    "type": "object",
    "properties": {
        "step_evaluations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "teacher_step_id": {
                        "type": "string"
                    },
                    "is_correct": {
                        "type": "boolean"
                    },
                    "reasoning": {
                        "type": "string"
                    }
                },
                "required": [
                    "teacher_step_id",
                    "is_correct",
                    "reasoning"
                ],
                "additionalProperties": False
            }
        }
    },
    "required": ["step_evaluations"],
    "additionalProperties": False
}