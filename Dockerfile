# Use official Python 3.11 base image
FROM python:3.11-slim

# Install Node.js 20
RUN apt-get update \
    && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/user/app

# Install Python backend dependencies first for caching
COPY requirements.txt .
RUN python3 -m pip install --no-cache-dir -r requirements.txt

# Install Expo app dependencies before copying the full repo
WORKDIR /home/user/app/VibeMatchApp
COPY VibeMatchApp/package.json VibeMatchApp/package-lock.json ./
RUN npm ci

# Copy the rest of the repository and build the web app
WORKDIR /home/user/app
COPY . .
WORKDIR /home/user/app/VibeMatchApp
RUN npx expo export --platform web --output-dir ../web-build

RUN useradd -m -u 1000 user \
    && chown -R user:user /home/user/app

USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    EXPO_NO_DOCTOR=1

WORKDIR /home/user/app

EXPOSE 7860

CMD uvicorn main:app --host 0.0.0.0 --port $PORT
