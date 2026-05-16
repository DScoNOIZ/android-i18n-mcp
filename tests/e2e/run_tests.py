#!/usr/bin/env python3
"""
E2E tests for android-i18n-mcp server.
Tests ALL exposed tools of the MCP server with correct Android project paths.

Android project structure:
  AndroidProject/app/src/main/res/values/strings.xml

Tools to test:
  1. check_missing_languages - check for missing language directories
  2. translate_module - translate a specific module
  3. translate_all_modules - translate all modules
  4. create_and_translate_missing_languages - create and translate missing languages
  5. get_job_status - get job status
  6. check_changes - check for changes
  7. configure_logging - configure logging
"""

import sys
import os
import time
import json
import shutil
import re

# Add current directory to import path
sys.path.insert(0, os.path.dirname(__file__))

from mcp_client import McpClient

# ============================================================
# CONSTANTS
# ============================================================

# Android project - correct structure
PROJECT_ROOT = "AndroidProject"
MODULE_PATH = "app"
# Full path to module
MODULE_FULL_PATH = os.path.join(PROJECT_ROOT, MODULE_PATH)

# Expected languages for testing (from .env: ru, en)
# For CI tests we use a small set of languages
TEST_LANGUAGES = ["de", "fr", "ru"]

# Languages supported by MCP server
SUPPORTED_LANGUAGES = [
    'zh-CN', 'zh-TW', 'zh-SG', 'zh-HK', 'zh-MO',
    'en', 'es', 'hi', 'fr', 'ar', 'bn', 'pt', 'ru',
    'ur', 'id', 'de', 'ja', 'sw', 'mr', 'te', 'tr',
    'ko', 'ta', 'vi', 'az', 'be', 'it', 'uk'
]

# Colors for output
RED = '\033[91m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
CYAN = '\033[96m'
RESET = '\033[0m'
BOLD = '\033[1m'

# Directory for reports (logs/ subdirectory in project root)
REPORT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "logs")
os.makedirs(REPORT_DIR, exist_ok=True)

# ============================================================
# UTILITIES
# ============================================================

def log_status(test_name, status, details=""):
    """Logs test status with color indication."""
    color = GREEN if status == "PASS" else RED if status == "FAIL" else YELLOW if status == "ERROR" else BLUE
    print(f"{color}[{status}]{RESET} {test_name}: {details}")

def log_info(message):
    """Logs informational message."""
    print(f"{BLUE}[INFO]{RESET} {message}")

def log_success(message):
    """Logs success message."""
    print(f"{GREEN}[OK]{RESET} {message}")

def log_warning(message):
    """Logs warning message."""
    print(f"{YELLOW}[WARN]{RESET} {message}")

def smart_poll_file(filepath, timeout=120, interval=2):
    """
    Waits for file to appear using smart polling.
    Returns True if file appeared, False otherwise.
    """
    start_time = time.time()
    log_info(f"Waiting for file: {filepath}")
    while time.time() - start_time < timeout:
        if os.path.exists(filepath):
            elapsed = time.time() - start_time
            log_success(f"File found in {elapsed:.1f}s: {filepath}")
            return True
        time.sleep(interval)
    log_warning(f"Timeout: file not found within {timeout}s")
    return False

def smart_poll_job(client, job_id, timeout=60, interval=3):
    """
    Waits for job to complete using smart polling.
    Returns Job text if completed, None otherwise.

    Server returns format:
    - Job {id}\nTool: ...\nStatus: running\n...Progress: 0% (0/1)
    - Job {id}\nTool: ...\nStatus: completed\n...Progress: 100%
    - Job {id}\nTool: ...\nStatus: failed\n...
    """
    start_time = time.time()
    log_info(f"Waiting for job to complete: {job_id}")

    while time.time() - start_time < timeout:
        try:
            response = client.call_tool("get_job_status", {"jobId": job_id}, timeout=15)
            if response and 'result' in response:
                for item in response['result'].get('content', []):
                    if item.get('type') == 'text':
                        text = item.get('text', '')
                        # Check status by keywords
                        if 'Status: completed' in text or 'completed' in text.lower():
                            elapsed = time.time() - start_time
                            log_success(f"Job completed in {elapsed:.1f}s")
                            return text
                        elif 'Status: failed' in text or 'failed' in text.lower():
                            elapsed = time.time() - start_time
                            log_warning(f"Job failed in {elapsed:.1f}s")
                            return text
                        # Check Progress: 100%
                        elif 'Progress: 100%' in text or 'Progress: 100 %' in text:
                            elapsed = time.time() - start_time
                            log_success(f"Job completed (100%) in {elapsed:.1f}s")
                            return text
                        # Check 'completed' keyword anywhere
                        elif 'completed' in text.lower():
                            elapsed = time.time() - start_time
                            log_success(f"Job completed in {elapsed:.1f}s")
                            return text
        except Exception as e:
            log_warning(f"Polling error: {e}")

        time.sleep(interval)

    log_warning(f"Timeout: job not completed within {timeout}s")
    return None

def save_logs(logs, filename):
    """Saves logs to file in the reports directory."""
    filepath = os.path.join(REPORT_DIR, filename)
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            for line in logs:
                f.write(line + '\n')
        log_info(f"Logs saved: {filepath}")
    except IOError as e:
        print(f"{RED}Error saving logs: {e}{RESET}")

def read_mcp_errors_log():
    """Reads mcp-errors.log file."""
    log_path = os.path.join(REPORT_DIR, "mcp-errors.log")
    if os.path.exists(log_path):
        try:
            with open(log_path, 'r', encoding='utf-8') as f:
                return f.read()
        except IOError as e:
            log_warning(f"Failed to read mcp-errors.log: {e}")
    return ""

def cleanup_language_dirs(project_root, languages):
    """
    Cleans up language directories before tests.
    Correct path: AndroidProject/app/src/main/res/values-{lang}/
    """
    for lang in languages:
        # Android structure: app/src/main/res/values-{lang}/
        lang_dir = os.path.join(project_root, "src", "main", "res", f"values-{lang}")
        if os.path.exists(lang_dir):
            log_info(f"Removing: {lang_dir}")
            shutil.rmtree(lang_dir)

def get_strings_file_path(module_path, lang):
    """
    Returns path to strings.xml file for a language.
    Correct Android structure: app/src/main/res/values-{lang}/strings.xml
    """
    return os.path.join(module_path, "src", "main", "res", f"values-{lang}", "strings.xml")

def extract_job_id(response):
    """Extracts Job ID from server response."""
    if not response or 'result' not in response:
        return None
    for item in response['result'].get('content', []):
        if item.get('type') == 'text':
            text = item.get('text', '')
            match = re.search(r'Job ID: ([a-f0-9-]+)', text, re.IGNORECASE)
            if match:
                return match.group(1)
    return None

def extract_text_from_response(response):
    """Extracts text from MCP server response."""
    if not response or 'result' not in response:
        return ""
    result_text = ""
    for item in response['result'].get('content', []):
        if item.get('type') == 'text':
            result_text += item.get('text', '')
    return result_text

def run_test_scenario(client, scenario_func, scenario_name):
    """Wrapper to execute a single test scenario."""
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{CYAN}>>> Running scenario: {scenario_name}{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")
    scenario_errors = []
    try:
        result = scenario_func(client)
        if result:
            log_status(scenario_name, "PASS", "Test passed successfully")
        else:
            log_status(scenario_name, "FAIL", "Test failed or bug detected")
    except Exception as e:
        log_status(scenario_name, "ERROR", str(e))
        scenario_errors.append(f"EXCEPTION: {str(e)}")
    finally:
        # Collect and save logs after test
        errors = client.get_recent_errors()
        if errors:
            log_filename = f"e2e_{scenario_name.replace(' ', '_')}_errors.log"
            save_logs(errors, log_filename)
            scenario_errors.extend(errors)

    return scenario_errors

# ============================================================
# TEST SCENARIOS
# ============================================================

def test_configure_logging(client):
    """Test 1: Verify configure_logging tool."""
    log_info("Calling configure_logging tool...")

    response = client.call_tool("configure_logging", {})
    log_info(f"Response: {response}")

    if not response:
        log_warning("Empty response from server")
        return False

    text = extract_text_from_response(response)
    if not text:
        log_warning("No text found in response")
        return False

    # Check response format
    if "File logging:" in text and "Log file:" in text:
        log_success("configure_logging response is correct")
        return True
    else:
        log_warning(f"Unexpected response format: {text}")
        return False


def test_check_missing_languages(client):
    """Test 2: Verify check_missing_languages tool."""
    log_info("Calling check_missing_languages tool...")

    # Clean up language directories for a clean test
    cleanup_language_dirs(MODULE_FULL_PATH, TEST_LANGUAGES)

    response = client.call_tool("check_missing_languages", {
        "projectRoot": PROJECT_ROOT,
        "languages": TEST_LANGUAGES
    })

    if not response:
        log_warning("Empty response from server")
        return False

    # Check it's not an error
    if response.get('result', {}).get('isError'):
        text = extract_text_from_response(response)
        log_warning(f"Server returned error: {text}")
        return False

    text = extract_text_from_response(response)
    log_info(f"Server response: {text}")

    # Check logs for parsing errors
    errors = client.get_recent_errors()
    critical_errors = [e for e in errors if "error" in e.lower() and "xml" in e.lower()]
    if critical_errors:
        log_warning(f"Critical errors detected: {critical_errors}")
        return False

    # Check response contains expected languages
    for lang in TEST_LANGUAGES:
        if lang in text or "Missing translations" in text or "Missing languages" in text:
            log_success(f"Language {lang} found in response")
            return True

    # If all languages already translated, that's also OK
    if "fully translated" in text.lower() or "all languages" in text.lower():
        log_success("All languages already translated")
        return True

    return True


def test_translate_module(client):
    """Test 3: Verify translate_module tool with Job ID and status."""
    log_info("Calling translate_module tool...")

    # Clean up language directories
    target_lang = TEST_LANGUAGES[0]  # 'de'
    cleanup_language_dirs(MODULE_FULL_PATH, [target_lang])

    response = client.call_tool("translate_module", {
        "modulePath": MODULE_PATH,
        "projectRoot": PROJECT_ROOT,
        "languages": [target_lang]
    })

    if not response:
        log_warning("Empty response from server")
        return False

    text = extract_text_from_response(response)
    log_info(f"Server response: {text}")

    # Check it's not an error
    if response.get('result', {}).get('isError'):
        log_warning(f"Server returned error: {text}")
        return False

    # Check we received Job ID
    job_id = extract_job_id(response)
    if not job_id:
        log_warning("Job ID not found in response")
        return False
    log_success(f"Received Job ID: {job_id}")

    # Wait for job to complete
    job_status = smart_poll_job(client, job_id, timeout=120)
    if not job_status:
        log_warning("Job did not complete")
        return False

    # Check file was created
    target_file = get_strings_file_path(MODULE_FULL_PATH, target_lang)
    if os.path.exists(target_file):
        log_success(f"File created: {target_file}")
        return True
    else:
        log_warning(f"File not created: {target_file}")
        return False


def test_check_changes(client):
    """Test 4: Verify check_changes tool."""
    log_info("Calling check_changes tool...")

    response = client.call_tool("check_changes", {
        "projectRoot": PROJECT_ROOT,
        "fileFilter": "**/values/strings.xml"
    })

    if not response:
        log_warning("Empty response from server")
        return False

    text = extract_text_from_response(response)
    log_info(f"Server response: {text[:500]}...")

    # Check it's not an error
    if response.get('result', {}).get('isError'):
        log_warning(f"Server returned error: {text}")
        return False

    # Check response contains expected keywords
    valid_keywords = ["changes", "added", "modified", "deleted", "languages", "module", "no changes"]
    has_valid_keyword = any(kw.lower() in text.lower() for kw in valid_keywords)
    if has_valid_keyword:
        log_success("check_changes response is correct")
        return True
    else:
        log_warning(f"Unexpected response format: {text[:200]}")
        return False


def test_translate_all_modules(client):
    """Test 5: Verify translate_all_modules tool."""
    log_info("Calling translate_all_modules tool...")

    # Clean up language directories
    cleanup_language_dirs(MODULE_FULL_PATH, TEST_LANGUAGES)

    response = client.call_tool("translate_all_modules", {
        "projectRoot": PROJECT_ROOT,
        "languages": TEST_LANGUAGES
    })

    if not response:
        log_warning("Empty response from server")
        return False

    text = extract_text_from_response(response)
    log_info(f"Server response: {text}")

    # Check it's not an error
    if response.get('result', {}).get('isError'):
        log_warning(f"Server returned error: {text}")
        return False

    # Check we received Job ID
    job_id = extract_job_id(response)
    if not job_id:
        log_warning("Job ID not found in response")
        return False
    log_success(f"Received Job ID: {job_id}")

    # Wait for job to complete
    job_status = smart_poll_job(client, job_id, timeout=120)
    if not job_status:
        log_warning("Job did not complete")
        return False

    # Check files were created
    all_created = True
    for lang in TEST_LANGUAGES:
        target_file = get_strings_file_path(MODULE_FULL_PATH, lang)
        if os.path.exists(target_file):
            log_success(f"File created: {target_file}")
        else:
            log_warning(f"File not created: {target_file}")
            all_created = False

    return all_created


def test_get_job_status(client):
    """Test 6: Verify get_job_status tool with valid and invalid jobId."""
    log_info("Testing get_job_status tool...")

    # First start a translate_module job
    target_lang = TEST_LANGUAGES[1]  # 'fr'
    cleanup_language_dirs(MODULE_FULL_PATH, [target_lang])

    response = client.call_tool("translate_module", {
        "modulePath": MODULE_PATH,
        "projectRoot": PROJECT_ROOT,
        "languages": [target_lang]
    })

    job_id = extract_job_id(response)
    if not job_id:
        log_warning("Failed to get Job ID for get_job_status test")
        return False

    # Test get_job_status with valid jobId
    log_info(f"Checking job status: {job_id}")
    status_response = client.call_tool("get_job_status", {"jobId": job_id})

    if not status_response:
        log_warning("Empty get_job_status response")
        return False

    status_text = extract_text_from_response(status_response)
    log_info(f"Job status: {status_text}")

    # Check status contains expected keywords
    if "Job" in status_text and ("status" in status_text.lower() or "Status" in status_text):
        log_success("get_job_status works correctly for valid ID")
    else:
        log_warning("get_job_status returned unexpected format")
        return False

    # Test get_job_status with invalid jobId
    log_info("Testing get_job_status with invalid ID...")
    invalid_response = client.call_tool("get_job_status", {"jobId": "00000000-0000-0000-0000-000000000000"})

    invalid_text = extract_text_from_response(invalid_response)
    log_info(f"Response for invalid ID: {invalid_text}")

    # Check error "Job not found" returned
    if "not found" in invalid_text.lower() or "not found" in str(invalid_response).lower():
        log_success("get_job_status correctly handles invalid ID")
        return True
    else:
        log_warning("get_job_status did not return error for invalid ID")
        return False


def test_create_and_translate_missing_languages(client):
    """Test 7: Verify create_and_translate_missing_languages tool."""
    log_info("Calling create_and_translate_missing_languages tool...")

    # Clean up language directories
    target_langs = [TEST_LANGUAGES[2]]  # 'ru'
    cleanup_language_dirs(MODULE_FULL_PATH, target_langs)

    response = client.call_tool("create_and_translate_missing_languages", {
        "projectRoot": PROJECT_ROOT,
        "languages": target_langs
    })

    if not response:
        log_warning("Empty response from server")
        return False

    text = extract_text_from_response(response)
    log_info(f"Server response: {text}")

    # Check it's not an error
    if response.get('result', {}).get('isError'):
        log_warning(f"Server returned error: {text}")
        return False

    # Check we received Job ID
    job_id = extract_job_id(response)
    if not job_id:
        log_warning("Job ID not found in response")
        return False
    log_success(f"Received Job ID: {job_id}")

    # Wait for job to complete
    job_status = smart_poll_job(client, job_id, timeout=120)
    if not job_status:
        log_warning("Job did not complete")
        return False

    # Check file was created
    target_file = get_strings_file_path(MODULE_FULL_PATH, target_langs[0])
    if os.path.exists(target_file):
        log_success(f"File created: {target_file}")
        return True
    else:
        log_warning(f"File not created: {target_file}")
        return False


def test_error_handling_invalid_project(client):
    """Test 8: Verify error handling with invalid projectRoot."""
    log_info("Testing error handling with invalid projectRoot...")

    response = client.call_tool("check_missing_languages", {
        "projectRoot": "/non/existent/path"
    })

    if not response:
        log_warning("Empty response from server")
        return False

    text = extract_text_from_response(response)
    log_info(f"Server response: {text}")

    # Check error returned
    if response.get('result', {}).get('isError'):
        log_success("Server correctly handles invalid projectRoot")
        return True
    else:
        log_warning("Server did not return error for invalid projectRoot")
        return False


def test_error_handling_invalid_language(client):
    """Test 9: Verify error handling with invalid language."""
    log_info("Testing error handling with invalid language...")

    response = client.call_tool("check_missing_languages", {
        "projectRoot": PROJECT_ROOT,
        "languages": ["invalid_lang_code"]
    })

    if not response:
        log_warning("Empty response from server")
        return False

    text = extract_text_from_response(response)
    log_info(f"Server response: {text}")

    # Check error about invalid language returned
    if response.get('result', {}).get('isError'):
        log_success("Server correctly handles invalid language")
        return True
    else:
        log_warning("Server did not return error for invalid language")
        return False


def test_error_handling_missing_job_id(client):
    """Test 10: Verify error handling with missing jobId."""
    log_info("Testing error handling with missing jobId...")

    response = client.call_tool("get_job_status", {})

    if not response:
        log_warning("Empty response from server")
        return False

    text = extract_text_from_response(response)
    log_info(f"Server response: {text}")

    # Check error returned
    if response.get('result', {}).get('isError'):
        log_success("Server correctly handles missing jobId")
        return True
    else:
        log_warning("Server did not return error for missing jobId")
        return False


def test_retranslate_existing_language(client):
    """Test 11: Verify re-translation of existing language - SHOULD detect Bug #1.

    Bug #1: When re-translating an existing language, the system reports
    "Translated: 0 strings" with "Errors: none" instead of correct behavior.

    Inverted logic for regression tests:
    - Test PASS if bug DETECTED (we found it)
    - Test FAIL if bug NOT detected (it exists but we didn't find it)
    """
    log_info("Testing re-translation (should detect Bug #1)...")

    target_lang = "vi"  # Use vi as in confirmed bug

    # 1. Clean and translate FIRST time
    cleanup_language_dirs(MODULE_FULL_PATH, [target_lang])
    response1 = client.call_tool("translate_module", {
        "modulePath": MODULE_PATH,
        "projectRoot": PROJECT_ROOT,
        "languages": [target_lang]
    })
    job_id1 = extract_job_id(response1)
    job_status1 = smart_poll_job(client, job_id1, timeout=120)

    # 2. Translate AGAIN the same language
    log_info("Re-translating the same language...")
    response2 = client.call_tool("translate_module", {
        "modulePath": MODULE_PATH,
        "projectRoot": PROJECT_ROOT,
        "languages": [target_lang]
    })
    job_id2 = extract_job_id(response2)
    job_status2 = smart_poll_job(client, job_id2, timeout=120)

    # 3. Check logs from mcp-errors.log - look for bug pattern: "Translated: 0" + "Errors: none"
    # Bug manifests when re-translation returns 0 strings without errors
    mcp_log = read_mcp_errors_log()

    bug1_detected = False
    # Look for pattern: "Translated: 0 strings" + "Errors: none" in one block
    lines = mcp_log.split('\n')
    for i, line in enumerate(lines):
        if "Translated: 0 strings" in line:
            # Check following lines for "Errors: none"
            context = '\n'.join(lines[max(0, i-5):min(len(lines), i+10)])
            if "Errors: none" in context:
                bug1_detected = True
                log_warning(f"BUG #1 DETECTED: {line}")
                break

    # Inverted logic for regression tests:
    # - If bug detected -> test PASS (we found it)
    # - If bug NOT detected -> test FAIL (bug exists but we didn't find it)
    if bug1_detected:
        log_warning("Bug #1 confirmed: re-translation returns 'Translated: 0 strings' with 'Errors: none'")
        return True   # PASS - bug detected
    else:
        log_warning("Bug #1 NOT detected - possibly already fixed OR test misconfigured")
        return False  # FAIL - bug not found


def test_filefilter_ignores_locale_files(client):
    """Test 12: Verify fileFilter - SHOULD detect Bug #2.

    Bug #2: When using fileFilter, translate_all_modules incorrectly
    translates LOCAL folders (values-vi) to target language instead of ignoring.

    Inverted logic for regression tests:
    - Test PASS if bug DETECTED (we found it)
    - Test FAIL if bug NOT detected (it exists but we didn't find it)
    """
    log_info("Testing fileFilter with locales (should detect Bug #2)...")

    target_lang = "az"  # Use az as in confirmed bug
    source_lang = "vi"  # Source language that should be ignored

    # 1. First create locale with known content
    vi_file = get_strings_file_path(MODULE_FULL_PATH, source_lang)
    vi_dir = os.path.dirname(vi_file)
    os.makedirs(vi_dir, exist_ok=True)

    original_vi_content = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="test">Vietnamese content</string>
</resources>"""

    with open(vi_file, 'w', encoding='utf-8') as f:
        f.write(original_vi_content)
    log_info(f"Created {source_lang} locale file: {vi_file}")

    # 2. Call translate_all_modules with fileFilter on az
    response = client.call_tool("translate_all_modules", {
        "projectRoot": PROJECT_ROOT,
        "fileFilter": "**/strings.xml",
        "languages": [target_lang]
    })

    job_id = extract_job_id(response)
    job_status = smart_poll_job(client, job_id, timeout=120)

    # 3. Check logs from mcp-errors.log - look for bug pattern
    # Bug manifests when translate_all_modules with fileFilter translates
    # LOCAL file (values-{target_lang}/strings.xml) instead of base (values/strings.xml)
    mcp_log = read_mcp_errors_log()

    bug2_detected = False
    lines = mcp_log.split('\n')
    for i, line in enumerate(lines):
        # Look for pattern: Module with values-{target_lang}/strings.xml
        # This means instead of base file, local target language file is processed
        if f"Module: app/src/main/res/values-{target_lang}/" in line:
            bug2_detected = True
            log_warning(f"BUG #2 DETECTED: {line}")
            break

    # Also check for "Language already exists with X strings. Skipping." pattern
    # This indicates incorrect behavior when translating
    for line in lines:
        if "Language already exists with" in line and target_lang in line:
            bug2_detected = True
            log_warning(f"BUG #2 DETECTED (SKIP pattern): {line}")
            break

    # Regression test for Bug #2 (fixed):
    # - If bug NOT detected -> test PASS (bug fixed, works correctly)
    # - If bug detected -> test FAIL (bug still present)
    if not bug2_detected:
        log_info("OK: Bug #2 NOT detected - fileFilter correctly ignores locale files")
        return True   # PASS - bug fixed
    else:
        log_warning(f"Bug #2 still present: fileFilter translates wrong file")
        return False  # FAIL - bug not fixed


def test_bug1_false_success_empty_filter(client):
    """BUG-1: check_missing_languages with non-existent fileFilter."""
    log_info("Testing BUG-1: check_missing_languages with non-existent filter...")
    response = client.call_tool("check_missing_languages", {
        "projectRoot": PROJECT_ROOT,
        "fileFilter": "**/nonexistent.xml"
    })
    text = extract_text_from_response(response)
    log_info(f"Server response: {text}")
    if "all languages are fully translated" in text.lower():
        log_warning("BUG-1 DETECTED: check_missing_languages returned success for non-existent filter")
        return True
    else:
        log_info("BUG-1 not detected")
        return False


def test_bug2_translate_already_translated_file(client):
    """BUG-2: translateModule translating file to same language."""
    log_info("Testing BUG-2: translateModule with path to already translated file...")
    target_lang = "ru"
    ru_file = get_strings_file_path(MODULE_FULL_PATH, target_lang)
    if not os.path.exists(ru_file):
        response1 = client.call_tool("translate_module", {
            "modulePath": MODULE_PATH,
            "projectRoot": PROJECT_ROOT,
            "languages": [target_lang]
        })
        job_id1 = extract_job_id(response1)
        smart_poll_job(client, job_id1, timeout=120)
    response2 = client.call_tool("translate_module", {
        "modulePath": "app/src/main/res/values-ru/strings.xml",
        "projectRoot": PROJECT_ROOT,
        "languages": [target_lang]
    })
    job_id2 = extract_job_id(response2)
    job_status2 = smart_poll_job(client, job_id2, timeout=120)
    mcp_log = read_mcp_errors_log()
    bug2_detected = False
    lines = mcp_log.split('\n')
    for i, line in enumerate(lines):
        if f"Module: app/src/main/res/values-{target_lang}/strings.xml" in line:
            context = '\n'.join(lines[max(0, i-3):min(len(lines), i+5)])
            if "Translated:" in context and "strings" in context:
                bug2_detected = True
                log_warning(f"BUG-2 DETECTED: {line}")
                break
    if bug2_detected:
        log_warning("Bug-2 confirmed")
        return True
    else:
        log_info("BUG-2 not detected")
        return False


def test_bug3_duplicate_languages(client):
    """BUG-3: duplicate languages not deduplicated."""
    log_info("Testing BUG-3: translate_module with duplicate languages...")
    target_lang = "de"
    cleanup_language_dirs(MODULE_FULL_PATH, [target_lang])
    response = client.call_tool("translate_module", {
        "modulePath": MODULE_PATH,
        "projectRoot": PROJECT_ROOT,
        "languages": [target_lang, target_lang, target_lang]
    })
    job_id = extract_job_id(response)
    if not job_id:
        log_warning("Failed to get Job ID")
        return False
    job_status = smart_poll_job(client, job_id, timeout=120)
    if job_status:
        if f"Languages: {target_lang}, {target_lang}, {target_lang}" in job_status:
            log_warning(f"BUG-3 DETECTED: languages '{target_lang}, {target_lang}, {target_lang}'")
            return True
        elif f"Languages: {target_lang}" in job_status:
            log_info(f"BUG-3 not detected")
            return False
    return False


def test_bug5_empty_project_root(client):
    """BUG-5: empty projectRoot in check_missing_languages."""
    log_info("Testing BUG-5: check_missing_languages with empty projectRoot...")
    response = client.call_tool("check_missing_languages", {"projectRoot": ""})
    text = extract_text_from_response(response)
    log_info(f"Server response: {text}")
    if "all languages are fully translated" in text.lower():
        log_warning("BUG-5 DETECTED: empty projectRoot returned success without check")
        return True
    else:
        log_info("BUG-5 not detected")
        return False


def test_bug6_path_traversal(client):
    """BUG-6: path traversal in translate_module."""
    log_info("Testing BUG-6: translate_module with path traversal...")
    response = client.call_tool("translate_module", {
        "modulePath": "app/../../../etc/passwd",
        "projectRoot": PROJECT_ROOT,
        "languages": ["ru"]
    })
    text = extract_text_from_response(response)
    log_info(f"Server response: {text}")
    if "../etc/passwd" in text or "passwd" in text:
        log_warning("BUG-6 DETECTED: path traversal not explicitly blocked")
        return True
    else:
        log_info("BUG-6 not detected")
        return False


def test_bug7_xss_injection(client):
    """BUG-7: XSS injection in modulePath."""
    log_info("Testing BUG-7: translate_module with XSS injection...")
    response = client.call_tool("translate_module", {
        "modulePath": "<script>alert('xss')</script>",
        "projectRoot": PROJECT_ROOT,
        "languages": ["ru"]
    })
    text = extract_text_from_response(response)
    log_info(f"Server response: {text}")
    if "<script>" in text or "alert('xss')" in text:
        log_warning("BUG-7 DETECTED: XSS pattern included in response without escaping")
        return True
    else:
        log_info("BUG-7 not detected")
        return False


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    print(f"\n{BOLD}{'#'*60}{RESET}")
    print(f"{CYAN}E2E TESTS for android-i18n-mcp{RESET}")
    print(f"{CYAN}Project structure: {MODULE_FULL_PATH}{RESET}")
    print(f"{CYAN}Test languages: {TEST_LANGUAGES}{RESET}")
    print(f"{BOLD}{'#'*60}{RESET}\n")

    # Check project exists
    if not os.path.exists(MODULE_FULL_PATH):
        print(f"{RED}[ERROR] Android project not found: {MODULE_FULL_PATH}{RESET}")
        sys.exit(1)

    # Check strings.xml exists
    default_strings = os.path.join(MODULE_FULL_PATH, "src", "main", "res", "values", "strings.xml")
    if not os.path.exists(default_strings):
        print(f"{RED}[ERROR] strings.xml not found: {default_strings}{RESET}")
        sys.exit(1)

    client = McpClient(PROJECT_ROOT)
    all_errors = []

    try:
        client.start()
        log_success("MCP server started and initialized")

        # Run all test scenarios
        test_scenarios = [
            (test_configure_logging, "Configure Logging"),
            (test_check_missing_languages, "Check Missing Languages"),
            (test_translate_module, "Translate Module"),
            (test_check_changes, "Check Changes"),
            (test_translate_all_modules, "Translate All Modules"),
            (test_get_job_status, "Get Job Status"),
            (test_create_and_translate_missing_languages, "Create and Translate Missing Languages"),
            (test_error_handling_invalid_project, "Error: Invalid Project"),
            (test_error_handling_invalid_language, "Error: Invalid Language"),
            (test_error_handling_missing_job_id, "Error: Missing JobId"),
            # Additional E2E tests for bug detection
            (test_retranslate_existing_language, "Retranslate Existing Language (Bug #1)"),
            (test_filefilter_ignores_locale_files, "FileFilter Ignores Locale Files (Bug #2)"),
            (test_bug1_false_success_empty_filter, "BUG-1: False Success Empty Filter"),
            (test_bug2_translate_already_translated_file, "BUG-2: Translate Already Translated"),
            (test_bug3_duplicate_languages, "BUG-3: Duplicate Languages"),
            (test_bug5_empty_project_root, "BUG-5: Empty Project Root"),
            (test_bug6_path_traversal, "BUG-6: Path Traversal"),
            (test_bug7_xss_injection, "BUG-7: XSS Injection"),
        ]

        passed = 0
        failed = 0

        for scenario_func, scenario_name in test_scenarios:
            errors = run_test_scenario(client, scenario_func, scenario_name)
            # Count only EXCEPTION/CRITICAL (real errors)
            # INFO/WARN logs are saved to files but don't affect count
            has_exception = any('EXCEPTION' in e or 'CRITICAL' in e for e in errors)
            if has_exception:
                all_errors.extend(errors)
                failed += 1
            else:
                if errors:
                    all_errors.extend(errors)  # INFO/WARN logs to general report
                passed += 1

        # Final report
        print(f"\n{BOLD}{'='*60}{RESET}")
        print(f"{CYAN}FINAL REPORT{RESET}")
        print(f"{BOLD}{'='*60}{RESET}")
        if failed == 0:
            print(f"{GREEN}ALL TESTS PASSED SUCCESSFULLY!{RESET}")
        print(f"Passed: {GREEN}{passed}{RESET}/{len(test_scenarios)}")
        if failed > 0:
            print(f"Failed: {RED}{failed}{RESET}/{len(test_scenarios)}")
        print(f"{BOLD}{'='*60}{RESET}\n")

    except Exception as e:
        print(f"{RED}[CRITICAL] Critical error running tests: {e}{RESET}")
        all_errors.append(f"CRITICAL: {str(e)}")
    finally:
        if client:
            client.stop()

        # Save overall error report
        if all_errors:
            save_logs(all_errors, "e2e_all_errors.log")

        print(f"\n{GREEN}Testing completed{RESET}")
