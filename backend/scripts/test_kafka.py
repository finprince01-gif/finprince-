import os
import asyncio
import django
import sys

# Setup Django
sys.path.insert(0, os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from aiokafka import AIOKafkaConsumer

async def test_consume():
    print("Connecting to Kafka...")
    consumer = AIOKafkaConsumer(
        'invoice.upload',
        bootstrap_servers='localhost:9092',
        auto_offset_reset='earliest'
    )
    await consumer.start()
    print("Consumer started. Waiting for message...")
    try:
        msg = await asyncio.wait_for(consumer.getone(), timeout=10.0)
        print(f"Received message: {msg.value}")
    except asyncio.TimeoutError:
        print("TIMED OUT - No messages received or could not connect.")
    finally:
        await consumer.stop()

if __name__ == "__main__":
    asyncio.run(test_consume())
