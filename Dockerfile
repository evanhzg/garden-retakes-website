FROM node:20-slim

# Install steamcmd dependencies
RUN dpkg --add-architecture i386 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        lib32gcc-s1 \
        curl \
        tar \
    && rm -rf /var/lib/apt/lists/*

# Download and extract steamcmd into a static folder
RUN mkdir -p /opt/steamcmd \
    && curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar zxvf - -C /opt/steamcmd

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# We build Next.js for production
RUN npm run build

# Render will mount a persistent disk at /data.
# We set HOME to /data/home so steamcmd persists its session cache (.steam folder)
ENV HOME=/data/home
ENV STEAMCMD_PATH=/opt/steamcmd/steamcmd.sh
ENV WORKSHOP_INDEX=/data/workshop/index.json

CMD ["npm", "run", "start"]
