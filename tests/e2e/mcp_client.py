#!/usr/bin/env python3
"""
MCP Client Wrapper: Non-invasive tool for launching and testing MCP servers.
Intercepts stdout (JSON-RPC) and stderr (error logs).
"""

import subprocess
import json
import threading
import queue
import os
import time

class McpClient:
    def __init__(self, project_root):
        self.project_root = project_root
        self.process = None
        self.stderr_queue = queue.Queue()
        self.stdout_queue = queue.Queue()
        self._stderr_thread = None
        self._stdout_thread = None
        self._request_id = 1
        self._responses = {}  # Dictionary to store responses by id
        self._lock = threading.Lock()
        
    def start(self):
        """Starts MCP server as a subprocess."""
        # Ensure the project is built
        build_path = os.path.join(os.getcwd(), 'build', 'src', 'index.js')
        if not os.path.exists(build_path):
            raise FileNotFoundError("First run 'npm run build'")

        # FIX: bufsize=0 (unbuffered) for binary mode
        # bufsize=1 with universal_newlines=False causes RuntimeWarning and buffering issues
        self.process = subprocess.Popen(
            ['node', build_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={
                **os.environ, 
                'ANDROID_PROJECT_ROOT': self.project_root
            },
            bufsize=0  # Unbuffered binary mode - critical for correct JSON-RPC via stdin/stdout
        )
        
        # Read stderr in a separate thread
        def read_stderr():
            # Check if process and stderr exist
            if not self.process or not self.process.stderr:
                return
            try:
                for line in iter(self.process.stderr.readline, b''):
                    if line:
                        decoded = line.decode('utf-8', errors='replace').strip()
                        if decoded:
                            self.stderr_queue.put(decoded)
            except (ValueError, OSError):
                pass  # Process finished
        
        # Read stdout (JSON-RPC responses) in a separate thread
        def read_stdout():
            # Check if process and stdout exist
            if not self.process or not self.process.stdout:
                return
            try:
                for line in iter(self.process.stdout.readline, b''):
                    if line:
                        decoded = line.decode('utf-8', errors='replace').strip()
                        if decoded:
                            try:
                                msg = json.loads(decoded)
                                with self._lock:
                                    if 'id' in msg:
                                        self._responses[msg['id']] = msg
                                    else:
                                        # Notifications or events without id
                                        self.stdout_queue.put(decoded)
                            except json.JSONDecodeError:
                                self.stdout_queue.put(decoded)  # Not JSON, just text
            except (ValueError, OSError):
                pass  # Process finished
        
        self._stderr_thread = threading.Thread(target=read_stderr, daemon=True)
        self._stdout_thread = threading.Thread(target=read_stdout, daemon=True)
        self._stderr_thread.start()
        self._stdout_thread.start()
        
        # Give the server time to initialize
        time.sleep(2)
        
        # Send initialize request according to MCP specification
        init_response = self.send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "e2e-test-client",
                "version": "1.0.0"
            }
        }, timeout=10)
        
        if not init_response or "error" in init_response:
            raise RuntimeError(f"MCP Initialize failed: {init_response}")
        
        # Send notifications/initialized (required by specification)
        self.send_notification("notifications/initialized", {})
        return init_response

    def send_request(self, method, params, timeout=30):
        """Sends a JSON-RPC request and waits for a response."""
        if not self.process or not self.process.stdin:
            raise RuntimeError("MCP server process is not running or stdin is not available")
        
        req_id = self._request_id
        self._request_id += 1
        
        request = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params
        }
        
        # Clear old responses with this id (just in case)
        with self._lock:
            if req_id in self._responses:
                del self._responses[req_id]
        
        # Send request
        data = json.dumps(request) + '\n'
        self.process.stdin.write(data.encode('utf-8'))
        self.process.stdin.flush()
        
        # Wait for response
        start_time = time.time()
        while time.time() - start_time < timeout:
            with self._lock:
                if req_id in self._responses:
                    return self._responses.pop(req_id)
            time.sleep(0.1)
        
        return None  # Timeout

    def send_notification(self, method, params):
        """Sends a JSON-RPC notification (without waiting for a response)."""
        if not self.process or not self.process.stdin:
            raise RuntimeError("MCP server process is not running or stdin is not available")
        
        notification = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        }
        data = json.dumps(notification) + '\n'
        self.process.stdin.write(data.encode('utf-8'))
        self.process.stdin.flush()

    def call_tool(self, tool_name, arguments, timeout=30):
        """Convenient method for calling MCP tools."""
        return self.send_request("tools/call", {
            "name": tool_name,
            "arguments": arguments
        }, timeout=timeout)

    def get_recent_errors(self, clear=True):
        """Returns a list of errors from logs (stderr)."""
        errors = []
        while not self.stderr_queue.empty():
            try:
                errors.append(self.stderr_queue.get_nowait())
            except queue.Empty:
                break
        return errors

    def get_recent_output(self, clear=True):
        """Returns recent outputs from stdout."""
        outputs = []
        while not self.stdout_queue.empty():
            try:
                outputs.append(self.stdout_queue.get_nowait())
            except queue.Empty:
                break
        return outputs

    def stop(self):
        """Stops the server."""
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
            except (ValueError, OSError):
                pass  # Process already finished or does not exist
            finally:
                self.process = None

    def is_alive(self):
        """Checks if the process is running."""
        return self.process is not None and self.process.poll() is None


if __name__ == "__main__":
    # Usage example
    client = McpClient("AndroidProject/app")
    try:
        client.start()
        print("Server started and initialized.")
        
        # Test call
        response = client.call_tool("check_missing_languages", {
            "projectRoot": "AndroidProject/app"
        })
        print(f"Server response: {response}")
        
        errors = client.get_recent_errors()
        if errors:
            print("Error logs:", errors)
            
    finally:
        client.stop()
        print("Test completed.")
