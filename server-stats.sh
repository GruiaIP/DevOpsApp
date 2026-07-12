#!/bin/bash

echo "==== Server Performance Stats ===="
echo

echo "CPU Usage:"
top -bn1 | grep "Cpu(s)"
echo

echo "Memory Usage:"
free -h
echo

echo "Disk Usage:"
df -h /
echo

echo "Top 5 Processes by CPU Usage:"
ps -eo pid,user,%cpu,comm --sort=-%cpu | head -6
echo

echo "Top 5 Processes by Memory Usage:"
ps -eo pid,user,%mem,comm --sort=-%mem | head -6
echo

echo "OS Version:"
cat /etc/os-release | grep PRETTY_NAME
echo

echo "Uptime:"
uptime
