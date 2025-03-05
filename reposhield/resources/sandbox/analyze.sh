#!/bin/bash

# Ensure necessary environment variables are set
if [ -z "$EXECMD" ]; then
  echo "EXECMD is not set! Please provide the command to start the web service."
  exit 1
fi

if [ -z "$LANGUAGE" ]; then
  echo "LANGUAGE is not set! Please provide the programming language (e.g., node, python)."
  exit 1
fi

if [ -z "$APPPORT" ]; then
  echo "APPPORT is not set! Please provide the port that the web service runs on."
  exit 1
fi

if [ -z "$VERBOSE_PROCMON" ]; then
  VERBOSE_PROCMON=""
  # -f to print verbose
fi

# Install dependencies based on the LANGUAGE environment variable
WORKSPACE="/opt/src"

install_dependencies() {  
  case "$LANGUAGE" in
    node)
      if [ -f "$WORKSPACE/package.json" ]; then
        echo "Installing Node.js dependencies from package.json..."
        npm install --prefix "$WORKSPACE"
      else
        echo "package.json not found in $WORKSPACE! Please ensure it exists to install dependencies."
        exit 1
      fi
      ;;
    python)
      if [ -f "$WORKSPACE/requirements.txt" ]; then
        echo "Installing Python dependencies from requirements.txt..."
        pip install -r "$WORKSPACE/requirements.txt" --break-system-packages
      else
        echo "requirements.txt not found in $WORKSPACE! Please ensure it exists to install dependencies."
        exit 1
      fi
      ;;
    ruby)
      if [ -f "$WORKSPACE/Gemfile" ]; then
        echo "Installing Ruby dependencies from Gemfile..."
        bundle install --gemfile="$WORKSPACE/Gemfile"
      else
        echo "Gemfile not found in $WORKSPACE! Please ensure it exists to install dependencies."
        exit 1
      fi
      ;;
    go)
      if [ -f "$WORKSPACE/go.mod" ]; then
        echo "Installing Go dependencies from go.mod..."
        go mod tidy -modfile="$WORKSPACE/go.mod"
      else
        echo "go.mod not found in $WORKSPACE! Please ensure it exists to install dependencies."
        exit 1
      fi
      ;;
    java)
      if [ -f "$WORKSPACE/pom.xml" ]; then
        echo "Installing Java dependencies from pom.xml (Maven)..."
        mvn -f "$WORKSPACE/pom.xml" install
      elif [ -f "$WORKSPACE/build.gradle" ]; then
        echo "Installing Java dependencies from build.gradle (Gradle)..."
        gradle -b "$WORKSPACE/build.gradle" build
      else
        echo "Neither pom.xml nor build.gradle found in $WORKSPACE! Please ensure one exists to install dependencies."
        exit 1
      fi
      ;;
    php)
      if [ -f "$WORKSPACE/composer.json" ]; then
        echo "Installing PHP dependencies from composer.json..."
        composer install --working-dir="$WORKSPACE"
      else
        echo "composer.json not found in $WORKSPACE! Please ensure it exists to install dependencies."
        exit 1
      fi
      ;;
    *)
      echo "Unsupported language: $LANGUAGE. Supported options are 'node', 'python', 'ruby', 'go', 'java', 'php'."
      exit 1
      ;;
  esac
}

echo "Changing to WORKSPACE directory: $WORKSPACE"
cd "$WORKSPACE" || { echo "Failed to change to WORKSPACE directory. Exiting."; exit 1; }

SANDBOX_DIR="$WORKSPACE/.reposhield/sandbox"
mkdir $SANDBOX_DIR

# Install dependencies
install_dependencies

WATCHER_DIR=/x86_64-unknown-linux-gnu
echo "Starting process monitor..."
# Start pspy to monitor processes
cp $SANDBOX_DIR/processes.txt $SANDBOX_DIR/processes.txt.bak
echo -n "" > $SANDBOX_DIR/processes.txt
$WATCHER_DIR/pspy64 --color=false $VERBOSE_PROCMON >> $SANDBOX_DIR/processes.txt 2>/dev/null &

# Wait for pspy to start, then clear the false positives
sleep 6
echo -n "" > $SANDBOX_DIR/processes.txt

# Start the web service
echo "Starting the web service with command: $EXECMD"
$EXECMD &
SERVICE_PID=$!

# Give the service a few seconds to initialize
sleep 5

# Check if the service is up by sending curl requests
wait_for_service() {
  local url="http://localhost:$APPPORT"
  echo "Waiting for the web service to start at $url..."

  until curl -s --head --max-time 2 "$url" > /dev/null; do
    echo "Service not up yet. Retrying in 1 second..."
    sleep 1
  done

  echo "Service is up and running!"
}

# Wait for service to be up and accessible
wait_for_service

# Track CPU and RAM usage of the service
CPU_RAM_LOG="$SANDBOX_DIR/report"
echo "Monitoring CPU and RAM usage for process ID $SERVICE_PID..." > "$CPU_RAM_LOG"
ps -p $SERVICE_PID -o %cpu,%mem,cmd >> "$CPU_RAM_LOG"

# Check if the service is running, if not, exit the script
if ! ps -p $SERVICE_PID > /dev/null; then
  echo "Service is not running. Exiting..." >> "$CPU_RAM_LOG"
  exit 1
fi

# filesystem watcher
cp $SANDBOX_DIR/watcher.log $SANDBOX_DIR/watcher.log.bak
echo -n "" > $SANDBOX_DIR/watcher.log
$WATCHER_DIR/watcher /home >> $SANDBOX_DIR/watcher.log 2>&1 &
$WATCHER_DIR/watcher /dev >> $SANDBOX_DIR/watcher.log 2>&1 &
$WATCHER_DIR/watcher /etc >> $SANDBOX_DIR/watcher.log 2>&1 &
$WATCHER_DIR/watcher /tmp >> $SANDBOX_DIR/watcher.log 2>&1 &
$WATCHER_DIR/watcher /root >> $SANDBOX_DIR/watcher.log 2>&1 &
$WATCHER_DIR/watcher /media >> $SANDBOX_DIR/watcher.log 2>&1 &
$WATCHER_DIR/watcher /mnt >> $SANDBOX_DIR/watcher.log 2>&1 &
$WATCHER_DIR/watcher /run >> $SANDBOX_DIR/watcher.log 2>&1 &
$WATCHER_DIR/watcher /sys >> $SANDBOX_DIR/watcher.log 2>&1 &
$WATCHER_DIR/watcher /usr >> $SANDBOX_DIR/watcher.log 2>&1 &
$WATCHER_DIR/watcher /var >> $SANDBOX_DIR/watcher.log 2>&1 &
$WATCHER_DIR/watcher /srv >> $SANDBOX_DIR/watcher.log 2>&1 &

# Wait for the service to finish running (optional, you can stop it after a certain timeout)
sleep 6000
kill -9 $SERVICE_PID

# Kills all watcher processes
ps aux | grep -E 'watcher|pspy64' | grep -v grep | awk '{print $2}' | xargs kill -9

echo "Web service has finished. Fuzzer results and resource usage can be found in $CPU_RAM_LOG"