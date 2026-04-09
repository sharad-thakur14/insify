# Choose a base image with Python
FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Setup user for Hugging Face Spaces compatibility
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copy the requirements file and install Python packages
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy local code to the container image
COPY --chown=user . .

# Build the Expo App
WORKDIR $HOME/app/VibeMatchApp
RUN npm install
RUN npx expo export --platform web

# Return to root application directory
WORKDIR $HOME/app

# Hugging Face runs exactly on port 7860
EXPOSE 7860

# Command to run the FastAPI server
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
