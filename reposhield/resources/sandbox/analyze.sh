#!/bin/bash

# Ensure necessary environment variables are set
if [ -z "$EXECMD" ]; then
  echo "EXECMD is not set! Please provide the command to start the web service."
  exit 1
fi

if [ -z "$ENDPOINTS" ]; then
  echo "ENDPOINTS is not set! Please provide a comma-delimited list of web service endpoints."
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
        pip install -r "$WORKSPACE/requirements.txt"
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

# Install dependencies
install_dependencies

# Start the web service
echo "Starting the web service with command: $EXECMD"
$EXECMD &
SERVICE_PID=$!

# Give the service a few seconds to initialize
sleep 5

# Track CPU and RAM usage of the service
CPU_RAM_LOG="/opt/src/.reposhield/report"
echo "Monitoring CPU and RAM usage for process ID $SERVICE_PID..." > "$CPU_RAM_LOG"
ps -p $SERVICE_PID -o %cpu,%mem,cmd >> "$CPU_RAM_LOG"

# Check if the service is running, if not, exit the script
if ! ps -p $SERVICE_PID > /dev/null; then
  echo "Service is not running. Exiting..." >> "$CPU_RAM_LOG"
  exit 1
fi

# Function to run the fuzzing tests on the endpoints
run_fuzzers() {
  local endpoints=$1
  local report_file=$2
  local found_issues=false

  echo -e "\nRunning fuzzers on endpoints..." >> "$report_file"

  # Iterate through each endpoint and simulate fuzzing
  IFS=',' read -r -a endpoint_array <<< "$endpoints"
  for endpoint in "\${endpoint_array[@]}"; do
    # Create the full URL using the APPPORT and the endpoint
    FULL_URL="http://localhost:\${APPPORT}/\${endpoint}"
    
    echo -e "Fuzzing endpoint: $FULL_URL" >> "$report_file"

    # Basic fuzzing logic (just random characters for this demo)
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$FULL_URL" -d "@<(echo $RANDOM)" -X POST)
    
    # You could add more detailed checks here to look for crashes or vulnerabilities
    if [[ "$RESPONSE" -eq 500 || "$RESPONSE" -eq 400 ]]; then
      echo "Potential issue or crash found at endpoint: $FULL_URL (HTTP $RESPONSE)" >> "$report_file"
      found_issues=true
    else
      echo "No issues found at endpoint: $FULL_URL" >> "$report_file"
    fi
  done

  # If no issues are found, log that information
  if [ "$found_issues" = false ]; then
    echo "nothing found" >> "$report_file"
  fi
}

# Run fuzzing tests on the given endpoints
run_fuzzers "$ENDPOINTS" "$CPU_RAM_LOG"

# Wait for the service to finish running (optional, you can stop it after a certain timeout)
sleep 3
kill -9 $SERVICE_PID

echo "Web service has finished. Fuzzer results and resource usage can be found in $CPU_RAM_LOG"