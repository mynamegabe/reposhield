FROM python:3.11.9-slim-bullseye

WORKDIR /app

# install mysql client
RUN apt-get update && apt-get install -y default-libmysqlclient-dev
RUN apt-get update && apt-get install ffmpeg libsm6 libxext6  -y
RUN apt-get install -y default-mysql-client 
RUN apt-get install -y iputils-ping

COPY ./requirements.txt ./
RUN pip install -r requirements.txt
# RUN pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

COPY . .
# COPY utils/config.py.remote utils/config.py

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]