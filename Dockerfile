# Use official Node 20 base image
FROM node:20-bullseye-slim

# Install Python 3 and pip
RUN apt-get update \
    && apt-get install -y python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && ln -sf /usr/bin/pip3 /usr/local/bin/pip

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
