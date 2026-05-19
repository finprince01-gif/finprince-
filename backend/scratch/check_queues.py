from core.sqs import QueueService
q = QueueService()
print(f"OCR Depth: {q.get_queue_depth('ocr')}")
print(f"AI Depth: {q.get_queue_depth('ai')}")
print(f"Assembly Depth: {q.get_queue_depth('assembly')}")
