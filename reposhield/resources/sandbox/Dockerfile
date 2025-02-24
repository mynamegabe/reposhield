FROM ubuntu:20.04

# tzdata install needs to be non-interactive
ENV DEBIAN_FRONTEND=noninteractive

# Set up the enviroment
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
    	software-properties-common \
    	vim \
    	curl \
    	wget \
    	git \
    	jq \
    	build-essential \
    	unzip \
    	apt-transport-https \
        python3.8 \
    	python3-venv \
    	python3-pip \
    	python3-setuptools \
        python3-dev \
    	gnupg \
    	g++ \
    	make \
    	gcc \
		nodejs \
    	apt-utils \
        rsync \
    	file \
        dos2unix \
        default-jdk \
		maven \
    	gettext && \
        apt-get clean && \
        ln -sf /usr/bin/python3.8 /usr/bin/python && \
        ln -sf /usr/bin/pip3 /usr/bin/pip

# Install Gradle
ENV GRADLE_VERSION=7.4.2
RUN wget https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip -P /tmp
RUN unzip -d /opt/gradle /tmp/gradle-${GRADLE_VERSION}-bin.zip
RUN ln -s /opt/gradle/gradle-${GRADLE_VERSION} /opt/gradle/latest

# Install Linguist
RUN apt-get install -y cmake pkg-config libicu-dev zlib1g-dev libcurl4-openssl-dev libssl-dev ruby-dev
RUN gem install github-linguist

# Install Golang
RUN wget -q -O - https://raw.githubusercontent.com/canha/golang-tools-install-script/master/goinstall.sh | bash

ENV PATH="$PATH:/opt/gradle/gradle-${GRADLE_VERSION}/bin:/root/go/bin:/root/.go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# RUN wget https://raw.githubusercontent.com/reposhield/scripts/analyze.zip -P /tmp
# RUN unzip -d /root/scripts /tmp/analyze.zip
COPY analyze.sh /root/scripts/analyze.sh
RUN chmod +x /root/scripts/analyze.sh
RUN dos2unix /root/scripts/analyze.sh

# Execute analyze script
WORKDIR /root/
ENTRYPOINT ["/root/scripts/analyze.sh"]