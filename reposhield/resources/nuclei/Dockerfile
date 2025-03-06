FROM alpine:latest

# Install dependencies
RUN apk add --no-cache curl unzip git

# Set working directory
WORKDIR /app

# Download and extract the specified Nuclei version
RUN curl -sL -o nuclei.zip "https://github.com/projectdiscovery/nuclei/releases/download/v3.3.9/nuclei_3.3.9_linux_amd64.zip" && \
    unzip nuclei.zip && \
    chmod +x nuclei && \
    mv nuclei /usr/local/bin/nuclei && \
    rm nuclei.zip

# Retrieve and install Nuclei templates
RUN nuclei -update-templates

# Create the /root/nuclei-templates/payloads directory
RUN mkdir -p /root/nuclei-templates/payloads

# Copy the payloads to /root/nuclei-templates
COPY payloads /root/nuclei-templates/payloads

# debug entrypoint to sleep
# ENTRYPOINT ["sleep", "infinity"]

# Define entrypoint
ENTRYPOINT ["nuclei"]

# Default command to run with templates and payloads
CMD ["-t", "/app/templates", "-u", "http://api:8000", "-o", "/app/results/results.txt"]
# "-jsonl",]
