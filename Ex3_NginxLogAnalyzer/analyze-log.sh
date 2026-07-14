#!/bin/bash

LOGFILE=$1

# Check if a log file was provided
if [ $# -ne 1 ]; then
    echo "Usage: $0 <log_file>"
    exit 1
fi

# Check if the file exists
if [ ! -f "$LOGFILE" ]; then
    echo "Error: File '$LOGFILE' not found."
    exit 1
fi

echo "Top 5 IP addresses with the most requests:"
awk '{print $1}' "$LOGFILE" \
    | sort \
    | uniq -c \
    | sort -rn \
    | head -5 \
    | awk '{print $2 " - " $1 " requests"}'

echo

echo "Top 5 most requested paths:"
awk '{print $7}' "$LOGFILE" \
    | sort \
    | uniq -c \
    | sort -rn \
    | head -5 \
    | awk '{print $2 " - " $1 " requests"}'

echo

echo "Top 5 response status codes:"
awk '{print $9}' "$LOGFILE" \
    | sort \
    | uniq -c \
    | sort -rn \
    | head -5 \
    | awk '{print $2 " - " $1 " requests"}'

echo

echo "Top 5 user agents:"
awk -F'"' '{print $6}' "$LOGFILE" \
    | sort \
    | uniq -c \
    | sort -rn \
    | head -5 \
    | awk '{
        count=$1
        $1=""
        sub(/^ /,"")
        print $0 " - " count " requests"
    }'