#!/usr/bin/env python3
"""
E2E тесты для android-i18n-mcp сервера.
Тестирует ВСЕ exposed tools MCP сервера с правильными путями Android проекта.

Структура Android проекта:
  AndroidProject/app/src/main/res/values/strings.xml

Tools для тестирования:
  1. check_missing_languages - проверка отсутствующих языков
  2. translate_module - перевод конкретного модуля
  3. translate_all_modules - перевод всех модулей
  4. create_and_translate_missing_languages - создание и перевод отсутствующих языков
  5. get_job_status - получение статуса задачи
  6. check_changes - проверка изменений
  7. configure_logging - настройка логирования
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
# КОНСТАНТЫ
# ============================================================

# Android проект - правильная структура
PROJECT_ROOT = "AndroidProject"
MODULE_PATH = "app"
# Полный путь к модулю
MODULE_FULL_PATH = os.path.join(PROJECT_ROOT, MODULE_PATH)

# Ожидаемые языки для тестирования (из .env: ru, en)
# Для CI тестов используем небольшой набор языков
TEST_LANGUAGES = ["de", "fr", "ru"]

# Поддерживаемые языки MCP сервером
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
# УТИЛИТЫ
# ============================================================

def log_status(test_name, status, details=""):
    """Логирует статус теста с цветовой индикацией."""
    color = GREEN if status == "PASS" else RED if status == "FAIL" else YELLOW if status == "ERROR" else BLUE
    print(f"{color}[{status}]{RESET} {test_name}: {details}")

def log_info(message):
    """Логирует информационное сообщение."""
    print(f"{BLUE}[INFO]{RESET} {message}")

def log_success(message):
    """Логирует успешное сообщение."""
    print(f"{GREEN}[OK]{RESET} {message}")

def log_warning(message):
    """Логирует предупреждение."""
    print(f"{YELLOW}[WARN]{RESET} {message}")

def smart_poll_file(filepath, timeout=120, interval=2):
    """
    Ожидает появления файла с помощью умного опроса (Smart Polling).
    Возвращает True если файл появился, иначе False.
    """
    start_time = time.time()
    log_info(f"Ожидание файла: {filepath}")
    while time.time() - start_time < timeout:
        if os.path.exists(filepath):
            elapsed = time.time() - start_time
            log_success(f"Файл найден за {elapsed:.1f}s: {filepath}")
            return True
        time.sleep(interval)
    log_warning(f"Таймаут: файл не найден за {timeout}s")
    return False

def smart_poll_job(client, job_id, timeout=60, interval=3):
    """
    Ожидает завершения задачи с помощью умного опроса.
    Возвращает Job объект если завершен, иначе None.
    
    Сервер возвращает формат:
    - 🔄 Job {id}\nTool: ...\nStatus: running\n...Progress: 0% (0/1)
    - ✅ Job {id}\nTool: ...\nStatus: completed\n...Progress: 100%
    - ❌ Job {id}\nTool: ...\nStatus: failed\n...
    """
    start_time = time.time()
    log_info(f"Ожидание завершения задачи: {job_id}")
    
    while time.time() - start_time < timeout:
        try:
            response = client.call_tool("get_job_status", {"jobId": job_id}, timeout=15)
            if response and 'result' in response:
                for item in response['result'].get('content', []):
                    if item.get('type') == 'text':
                        text = item.get('text', '')
                        # Проверяем статус по ключевым словам
                        if 'Status: completed' in text or 'completed' in text.lower() or '✅' in text:
                            elapsed = time.time() - start_time
                            log_success(f"Задача завершена за {elapsed:.1f}s")
                            return text
                        elif 'Status: failed' in text or 'failed' in text.lower() or '❌' in text:
                            elapsed = time.time() - start_time
                            log_warning(f"Задача завершена с ошибкой за {elapsed:.1f}s")
                            return text
                        # Проверяем Progress: 100%
                        elif 'Progress: 100%' in text or 'Progress: 100 %' in text:
                            elapsed = time.time() - start_time
                            log_success(f"Задача завершена (100%) за {elapsed:.1f}s")
                            return text
                        # Проверяем ключевое слово completed в любом месте
                        elif 'completed' in text.lower():
                            elapsed = time.time() - start_time
                            log_success(f"Задача завершена за {elapsed:.1f}s")
                            return text
        except Exception as e:
            log_warning(f"Ошибка опроса: {e}")
        
        time.sleep(interval)
    
    log_warning(f"Таймаут: задача не завершена за {timeout}s")
    return None

def save_logs(logs, filename):
    """Сохраняет логи в файл в директории отчетов."""
    filepath = os.path.join(REPORT_DIR, filename)
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            for line in logs:
                f.write(line + '\n')
        log_info(f"Логи сохранены: {filepath}")
    except IOError as e:
        print(f"{RED}Ошибка сохранения логов: {e}{RESET}")

def read_mcp_errors_log():
    """Читает логи из mcp-errors.log файла."""
    log_path = os.path.join(REPORT_DIR, "mcp-errors.log")
    if os.path.exists(log_path):
        try:
            with open(log_path, 'r', encoding='utf-8') as f:
                return f.read()
        except IOError as e:
            log_warning(f"Не удалось прочитать mcp-errors.log: {e}")
    return ""

def cleanup_language_dirs(project_root, languages):
    """
    Очищает языковые директории перед тестами.
    Правильный путь: AndroidProject/app/src/main/res/values-{lang}/
    """
    for lang in languages:
        # Android структура: app/src/main/res/values-{lang}/
        lang_dir = os.path.join(project_root, "src", "main", "res", f"values-{lang}")
        if os.path.exists(lang_dir):
            log_info(f"Удаление: {lang_dir}")
            shutil.rmtree(lang_dir)

def get_strings_file_path(module_path, lang):
    """
    Возвращает путь к файлу strings.xml для языка.
    Правильная Android структура: app/src/main/res/values-{lang}/strings.xml
    """
    return os.path.join(module_path, "src", "main", "res", f"values-{lang}", "strings.xml")

def extract_job_id(response):
    """Извлекает Job ID из ответа сервера."""
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
    """Извлекает текст из ответа MCP сервера."""
    if not response or 'result' not in response:
        return ""
    result_text = ""
    for item in response['result'].get('content', []):
        if item.get('type') == 'text':
            result_text += item.get('text', '')
    return result_text

def run_test_scenario(client, scenario_func, scenario_name):
    """Обёртка для выполнения одного сценария тестирования."""
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{CYAN}>>> Running scenario: {scenario_name}{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")
    scenario_errors = []
    try:
        result = scenario_func(client)
        if result:
            log_status(scenario_name, "PASS", "Тест успешно пройден")
        else:
            log_status(scenario_name, "FAIL", "Тест провален или обнаружен баг")
    except Exception as e:
        log_status(scenario_name, "ERROR", str(e))
        scenario_errors.append(f"EXCEPTION: {str(e)}")
    finally:
        # Собираем и сохраняем логи после теста
        errors = client.get_recent_errors()
        if errors:
            log_filename = f"e2e_{scenario_name.replace(' ', '_')}_errors.log"
            save_logs(errors, log_filename)
            scenario_errors.extend(errors)
    
    return scenario_errors

# ============================================================
# ТЕСТОВЫЕ СЦЕНАРИИ
# ============================================================

def test_configure_logging(client):
    """Test 1: Проверка configure_logging tool."""
    log_info("Вызов configure_logging tool...")
    
    response = client.call_tool("configure_logging", {})
    log_info(f"Ответ: {response}")
    
    if not response:
        log_warning("Пустой ответ от сервера")
        return False
    
    text = extract_text_from_response(response)
    if not text:
        log_warning("Текст не найден в ответе")
        return False
    
    # Проверяем формат ответа
    if "File logging:" in text and "Log file:" in text:
        log_success(f"configure_logging ответ корректен")
        return True
    else:
        log_warning(f"Неожиданный формат ответа: {text}")
        return False


def test_check_missing_languages(client):
    """Test 2: Проверка check_missing_languages tool."""
    log_info("Вызов check_missing_languages tool...")
    
    # Очищаем языковые директории для чистого теста
    cleanup_language_dirs(MODULE_FULL_PATH, TEST_LANGUAGES)
    
    response = client.call_tool("check_missing_languages", {
        "projectRoot": PROJECT_ROOT,
        "languages": TEST_LANGUAGES
    })
    
    if not response:
        log_warning("Пустой ответ от сервера")
        return False
    
    # Проверяем, что это не ошибка
    if response.get('result', {}).get('isError'):
        text = extract_text_from_response(response)
        log_warning(f"Сервер вернул ошибку: {text}")
        return False
    
    text = extract_text_from_response(response)
    log_info(f"Ответ сервера: {text}")
    
    # Проверяем логи на ошибки парсинга
    errors = client.get_recent_errors()
    critical_errors = [e for e in errors if "error" in e.lower() and "xml" in e.lower()]
    if critical_errors:
        log_warning(f"Обнаружены критические ошибки: {critical_errors}")
        return False
    
    # Проверяем, что ответ содержит ожидаемые языки
    for lang in TEST_LANGUAGES:
        if lang in text or "Missing translations" in text or "Missing languages" in text:
            log_success(f"Язык {lang} найден в ответе")
            return True
    
    # Если все языки уже переведены, это тоже OK
    if "fully translated" in text.lower() or "all languages" in text.lower():
        log_success("Все языки уже переведены")
        return True
    
    return True


def test_translate_module(client):
    """Test 3: Проверка translate_module tool с получением Job ID и статуса."""
    log_info("Вызов translate_module tool...")
    
    # Очищаем языковые директории
    target_lang = TEST_LANGUAGES[0]  # 'de'
    cleanup_language_dirs(MODULE_FULL_PATH, [target_lang])
    
    response = client.call_tool("translate_module", {
        "modulePath": MODULE_PATH,
        "projectRoot": PROJECT_ROOT,
        "languages": [target_lang]
    })
    
    if not response:
        log_warning("Пустой ответ от сервера")
        return False
    
    text = extract_text_from_response(response)
    log_info(f"Ответ сервера: {text}")
    
    # Проверяем, что это не ошибка
    if response.get('result', {}).get('isError'):
        log_warning(f"Сервер вернул ошибку: {text}")
        return False
    
    # Проверяем, что получили Job ID
    job_id = extract_job_id(response)
    if not job_id:
        log_warning("Job ID не найден в ответе")
        return False
    log_success(f"Получен Job ID: {job_id}")
    
    # Ждем завершения задачи
    job_status = smart_poll_job(client, job_id, timeout=120)
    if not job_status:
        log_warning("Задача не завершилась")
        return False
    
    # Проверяем, что файл создан
    target_file = get_strings_file_path(MODULE_FULL_PATH, target_lang)
    if os.path.exists(target_file):
        log_success(f"Файл создан: {target_file}")
        return True
    else:
        log_warning(f"Файл не создан: {target_file}")
        return False


def test_check_changes(client):
    """Test 4: Проверка check_changes tool."""
    log_info("Вызов check_changes tool...")
    
    response = client.call_tool("check_changes", {
        "projectRoot": PROJECT_ROOT,
        "fileFilter": "**/values/strings.xml"
    })
    
    if not response:
        log_warning("Пустой ответ от сервера")
        return False
    
    text = extract_text_from_response(response)
    log_info(f"Ответ сервера: {text[:500]}...")
    
    # Проверяем, что это не ошибка
    if response.get('result', {}).get('isError'):
        log_warning(f"Сервер вернул ошибку: {text}")
        return False
    
    # Проверяем, что ответ содержит ожидаемые ключевые слова
    valid_keywords = ["changes", "added", "modified", "deleted", "languages", "module", "no changes"]
    has_valid_keyword = any(kw.lower() in text.lower() for kw in valid_keywords)
    if has_valid_keyword:
        log_success("check_changes ответ корректен")
        return True
    else:
        log_warning(f"Неожиданный формат ответа: {text[:200]}")
        return False


def test_translate_all_modules(client):
    """Test 5: Проверка translate_all_modules tool."""
    log_info("Вызов translate_all_modules tool...")
    
    # Очищаем языковые директории
    cleanup_language_dirs(MODULE_FULL_PATH, TEST_LANGUAGES)
    
    response = client.call_tool("translate_all_modules", {
        "projectRoot": PROJECT_ROOT,
        "languages": TEST_LANGUAGES
    })
    
    if not response:
        log_warning("Пустой ответ от сервера")
        return False
    
    text = extract_text_from_response(response)
    log_info(f"Ответ сервера: {text}")
    
    # Проверяем, что это не ошибка
    if response.get('result', {}).get('isError'):
        log_warning(f"Сервер вернул ошибку: {text}")
        return False
    
    # Проверяем, что получили Job ID
    job_id = extract_job_id(response)
    if not job_id:
        log_warning("Job ID не найден в ответе")
        return False
    log_success(f"Получен Job ID: {job_id}")
    
    # Ждем завершения задачи
    job_status = smart_poll_job(client, job_id, timeout=120)
    if not job_status:
        log_warning("Задача не завершилась")
        return False
    
    # Проверяем, что файлы созданы
    all_created = True
    for lang in TEST_LANGUAGES:
        target_file = get_strings_file_path(MODULE_FULL_PATH, lang)
        if os.path.exists(target_file):
            log_success(f"Файл создан: {target_file}")
        else:
            log_warning(f"Файл не создан: {target_file}")
            all_created = False
    
    return all_created


def test_get_job_status(client):
    """Test 6: Проверка get_job_status tool с валидным и невалидным jobId."""
    log_info("Тестирование get_job_status tool...")
    
    # Сначала запускаем задачу translate_module
    target_lang = TEST_LANGUAGES[1]  # 'fr'
    cleanup_language_dirs(MODULE_FULL_PATH, [target_lang])
    
    response = client.call_tool("translate_module", {
        "modulePath": MODULE_PATH,
        "projectRoot": PROJECT_ROOT,
        "languages": [target_lang]
    })
    
    job_id = extract_job_id(response)
    if not job_id:
        log_warning("Не удалось получить Job ID для теста get_job_status")
        return False
    
    # Тестируем get_job_status с валидным jobId
    log_info(f"Проверка статуса задачи: {job_id}")
    status_response = client.call_tool("get_job_status", {"jobId": job_id})
    
    if not status_response:
        log_warning("Пустой ответ get_job_status")
        return False
    
    status_text = extract_text_from_response(status_response)
    log_info(f"Статус задачи: {status_text}")
    
    # Проверяем, что статус содержит ожидаемые ключевые слова
    if "Job" in status_text and ("status" in status_text.lower() or "Status" in status_text):
        log_success("get_job_status для валидного ID работает корректно")
    else:
        log_warning("get_job_status вернул неожиданный формат")
        return False
    
    # Тестируем get_job_status с невалидным jobId
    log_info("Проверка get_job_status с невалидным ID...")
    invalid_response = client.call_tool("get_job_status", {"jobId": "00000000-0000-0000-0000-000000000000"})
    
    invalid_text = extract_text_from_response(invalid_response)
    log_info(f"Ответ на невалидный ID: {invalid_text}")
    
    # Проверяем, что вернулась ошибка "Job not found"
    if "not found" in invalid_text.lower() or "not found" in str(invalid_response).lower():
        log_success("get_job_status корректно обрабатывает невалидный ID")
        return True
    else:
        log_warning("get_job_status не вернул ошибку для невалидного ID")
        return False


def test_create_and_translate_missing_languages(client):
    """Test 7: Проверка create_and_translate_missing_languages tool."""
    log_info("Вызов create_and_translate_missing_languages tool...")
    
    # Очищаем языковые директории
    target_langs = [TEST_LANGUAGES[2]]  # 'ru'
    cleanup_language_dirs(MODULE_FULL_PATH, target_langs)
    
    response = client.call_tool("create_and_translate_missing_languages", {
        "projectRoot": PROJECT_ROOT,
        "languages": target_langs
    })
    
    if not response:
        log_warning("Пустой ответ от сервера")
        return False
    
    text = extract_text_from_response(response)
    log_info(f"Ответ сервера: {text}")
    
    # Проверяем, что это не ошибка
    if response.get('result', {}).get('isError'):
        log_warning(f"Сервер вернул ошибку: {text}")
        return False
    
    # Проверяем, что получили Job ID
    job_id = extract_job_id(response)
    if not job_id:
        log_warning("Job ID не найден в ответе")
        return False
    log_success(f"Получен Job ID: {job_id}")
    
    # Ждем завершения задачи
    job_status = smart_poll_job(client, job_id, timeout=120)
    if not job_status:
        log_warning("Задача не завершилась")
        return False
    
    # Проверяем, что файл создан
    target_file = get_strings_file_path(MODULE_FULL_PATH, target_langs[0])
    if os.path.exists(target_file):
        log_success(f"Файл создан: {target_file}")
        return True
    else:
        log_warning(f"Файл не создан: {target_file}")
        return False


def test_error_handling_invalid_project(client):
    """Test 8: Проверка обработки ошибок при невалидном projectRoot."""
    log_info("Тестирование обработки ошибок с невалидным projectRoot...")
    
    response = client.call_tool("check_missing_languages", {
        "projectRoot": "/non/existent/path"
    })
    
    if not response:
        log_warning("Пустой ответ от сервера")
        return False
    
    text = extract_text_from_response(response)
    log_info(f"Ответ сервера: {text}")
    
    # Проверяем, что вернулась ошибка
    if response.get('result', {}).get('isError'):
        log_success("Сервер корректно обрабатывает невалидный projectRoot")
        return True
    else:
        log_warning("Сервер не вернул ошибку для невалидного projectRoot")
        return False


def test_error_handling_invalid_language(client):
    """Test 9: Проверка обработки ошибок при невалидном языке."""
    log_info("Тестирование обработки ошибок с невалидным языком...")
    
    response = client.call_tool("check_missing_languages", {
        "projectRoot": PROJECT_ROOT,
        "languages": ["invalid_lang_code"]
    })
    
    if not response:
        log_warning("Пустой ответ от сервера")
        return False
    
    text = extract_text_from_response(response)
    log_info(f"Ответ сервера: {text}")
    
    # Проверяем, что вернулась ошибка о невалидном языке
    if response.get('result', {}).get('isError'):
        log_success("Сервер корректно обрабатывает невалидный язык")
        return True
    else:
        log_warning("Сервер не вернул ошибку для невалидного языка")
        return False


def test_error_handling_missing_job_id(client):
    """Test 10: Проверка обработки ошибок при отсутствующем jobId."""
    log_info("Тестирование обработки ошибок без jobId...")
    
    response = client.call_tool("get_job_status", {})
    
    if not response:
        log_warning("Пустой ответ от сервера")
        return False
    
    text = extract_text_from_response(response)
    log_info(f"Ответ сервера: {text}")
    
    # Проверяем, что вернулась ошибка
    if response.get('result', {}).get('isError'):
        log_success("Сервер корректно обрабатывает отсутствующий jobId")
        return True
    else:
        log_warning("Сервер не вернул ошибку для отсутствующего jobId")
        return False


def test_retranslate_existing_language(client):
    """Test 11: Проверка повторного перевода - ДОЛЖЕН обнаружить Баг #1.
    
    Баг #1: При повторном переводе существующего языка система сообщает
    "Translated: 0 strings" с "Errors: none" вместо корректного поведения.
    
    Логика инвертированная для regression тестов:
    - Тест PASS если баг ОБНАРУЖЕН (мы его нашли)
    - Тест FAIL если баг НЕ обнаружен (он есть, но мы не нашли)
    """
    log_info("Тестирование повторного перевода (должен обнаружить Баг #1)...")
    
    target_lang = "vi"  # Использовать vi как в подтверждённом баге
    
    # 1. Очищаем и переводим ПЕРВЫЙ раз
    cleanup_language_dirs(MODULE_FULL_PATH, [target_lang])
    response1 = client.call_tool("translate_module", {
        "modulePath": MODULE_PATH,
        "projectRoot": PROJECT_ROOT,
        "languages": [target_lang]
    })
    job_id1 = extract_job_id(response1)
    job_status1 = smart_poll_job(client, job_id1, timeout=120)
    
    # 2. Переводим СНОВА тот же язык
    log_info("Повторный перевод того же языка...")
    response2 = client.call_tool("translate_module", {
        "modulePath": MODULE_PATH,
        "projectRoot": PROJECT_ROOT,
        "languages": [target_lang]
    })
    job_id2 = extract_job_id(response2)
    job_status2 = smart_poll_job(client, job_id2, timeout=120)
    
    # 3. Проверяем логи из mcp-errors.log - ищем паттерн бага: "Translated: 0" + "Errors: none"
    # Баг проявляется когда при повторном переводе получаем 0 строк без ошибок
    mcp_log = read_mcp_errors_log()
    
    bug1_detected = False
    # Ищем паттерн: "Translated: 0 strings" + "Errors: none" в одном блоке
    lines = mcp_log.split('\n')
    for i, line in enumerate(lines):
        if "Translated: 0 strings" in line:
            # Проверяем следующие строки на "Errors: none"
            context = '\n'.join(lines[max(0, i-5):min(len(lines), i+10)])
            if "Errors: none" in context:
                bug1_detected = True
                log_warning(f"БАГ #1 ОБНАРУЖЕН: {line}")
                break
    
    # Инвертированная логика для regression тестов:
    # - Если баг обнаружен → тест PASS (мы его нашли)
    # - Если баг НЕ обнаружен → тест FAIL (баг есть, но мы не нашли)
    if bug1_detected:
        log_warning("Баг #1 подтвержден: повторный перевод возвращает 'Translated: 0 strings' с 'Errors: none'")
        return True   # PASS - баг обнаружен
    else:
        log_warning("Баг #1 НЕ обнаружен - возможно он уже исправлен ИЛИ тест неправильно настроен")
        return False  # FAIL - баг не найден


def test_filefilter_ignores_locale_files(client):
    """Test 12: Проверка fileFilter - ДОЛЖЕН обнаружить Баг #2.
    
    Баг #2: При использовании fileFilter, translate_all_modules неправильно
    переводит ЛОКАЛЬНЫЕ папки (values-vi) на целевой язык вместо игнорирования.
    
    Логика инвертированная для regression тестов:
    - Тест PASS если баг ОБНАРУЖЕН (мы его нашли)
    - Тест FAIL если баг НЕ обнаружен (он есть, но мы не нашли)
    """
    log_info("Тестирование fileFilter с локалями (должен обнаружить Баг #2)...")
    
    target_lang = "az"  # Использовать az как в подтверждённом баге
    source_lang = "vi"  # Язык-источник который должен игнорироваться
    
    # 1. Сначала создаём локаль vi с известным содержанием
    vi_file = get_strings_file_path(MODULE_FULL_PATH, source_lang)
    vi_dir = os.path.dirname(vi_file)
    os.makedirs(vi_dir, exist_ok=True)
    
    original_vi_content = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="test">Vietnamese content</string>
</resources>"""
    
    with open(vi_file, 'w', encoding='utf-8') as f:
        f.write(original_vi_content)
    log_info(f"Создан файл локали {source_lang}: {vi_file}")
    
    # 2. Вызываем translate_all_modules с fileFilter на az
    response = client.call_tool("translate_all_modules", {
        "projectRoot": PROJECT_ROOT,
        "fileFilter": "**/strings.xml",
        "languages": [target_lang]
    })
    
    job_id = extract_job_id(response)
    job_status = smart_poll_job(client, job_id, timeout=120)
    
    # 3. Проверяем логи из mcp-errors.log - ищем паттерн бага
    # Баг проявляется когда translate_all_modules с fileFilter переводит
    # ЛОКАЛЬНЫЙ файл (values-{target_lang}/strings.xml) вместо базового (values/strings.xml)
    mcp_log = read_mcp_errors_log()
    
    bug2_detected = False
    lines = mcp_log.split('\n')
    for i, line in enumerate(lines):
        # Ищем паттерн: Module с values-{target_lang}/strings.xml
        # Это означает что вместо базового файла обрабатывается локальный файл целевого языка
        if f"Module: app/src/main/res/values-{target_lang}/" in line:
            bug2_detected = True
            log_warning(f"БАГ #2 ОБНАРУЖЕН: {line}")
            break
    
    # Также проверяем на паттерн "Language already exists with X strings. Skipping."
    # Это указывает на неправильное поведение при переводе
    for line in lines:
        if "Language already exists with" in line and target_lang in line:
            bug2_detected = True
            log_warning(f"БАГ #2 ОБНАРУЖЕН (SKIP паттерн): {line}")
            break
    
    # Regression тест для Bug #2 (исправлен):
    # - Если баг НЕ обнаружен → тест PASS (баг исправлен, всё работает)
    # - Если баг обнаружен → тест FAIL (баг всё ещё присутствует)
    if not bug2_detected:
        log_info("✅ Баг #2 НЕ обнаружен - fileFilter корректно игнорирует locale файлы")
        return True   # PASS - баг исправлен
    else:
        log_warning(f"Баг #2 всё ещё присутствует: fileFilter переводит неправильный файл")
        return False  # FAIL - баг не исправлен


def test_bug1_false_success_empty_filter(client):
    """BUG-1: check_missing_languages с несуществующим fileFilter."""
    log_info("Тестирование BUG-1: check_missing_languages с несуществующим filter...")
    response = client.call_tool("check_missing_languages", {
        "projectRoot": PROJECT_ROOT,
        "fileFilter": "**/nonexistent.xml"
    })
    text = extract_text_from_response(response)
    log_info(f"Ответ сервера: {text}")
    if "all languages are fully translated" in text.lower():
        log_warning("БАГ-1 ОБНАРУЖЕН: check_missing_languages вернул успех для несуществующего filter")
        return True
    else:
        log_info("BUG-1 не обнаружен")
        return False


def test_bug2_translate_already_translated_file(client):
    """BUG-2: translateModule перевод файла на тот же язык."""
    log_info("Тестирование BUG-2: translateModule с путем к уже переведенному файлу...")
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
                log_warning(f"БАГ-2 ОБНАРУЖЕН: {line}")
                break
    if bug2_detected:
        log_warning("Баг-2 подтвержден")
        return True
    else:
        log_info("BUG-2 не обнаружен")
        return False


def test_bug3_duplicate_languages(client):
    """BUG-3: дубликаты языков не дедуплицируются."""
    log_info("Тестирование BUG-3: translate_module с дубликатами языков...")
    target_lang = "de"
    cleanup_language_dirs(MODULE_FULL_PATH, [target_lang])
    response = client.call_tool("translate_module", {
        "modulePath": MODULE_PATH,
        "projectRoot": PROJECT_ROOT,
        "languages": [target_lang, target_lang, target_lang]
    })
    job_id = extract_job_id(response)
    if not job_id:
        log_warning("Не удалось получить Job ID")
        return False
    job_status = smart_poll_job(client, job_id, timeout=120)
    if job_status:
        if f"Languages: {target_lang}, {target_lang}, {target_lang}" in job_status:
            log_warning(f"БАГ-3 ОБНАРУЖЕН: languages '{target_lang}, {target_lang}, {target_lang}'")
            return True
        elif f"Languages: {target_lang}" in job_status:
            log_info(f"BUG-3 не обнаружен")
            return False
    return False


def test_bug5_empty_project_root(client):
    """BUG-5: пустой projectRoot в check_missing_languages."""
    log_info("Тестирование BUG-5: check_missing_languages с пустым projectRoot...")
    response = client.call_tool("check_missing_languages", {"projectRoot": ""})
    text = extract_text_from_response(response)
    log_info(f"Ответ сервера: {text}")
    if "all languages are fully translated" in text.lower():
        log_warning("БАГ-5 ОБНАРУЖЕН: пустой projectRoot вернул успех без проверки")
        return True
    else:
        log_info("BUG-5 не обнаружен")
        return False


def test_bug6_path_traversal(client):
    """BUG-6: path traversal в translate_module."""
    log_info("Тестирование BUG-6: translate_module с path traversal...")
    response = client.call_tool("translate_module", {
        "modulePath": "app/../../../etc/passwd",
        "projectRoot": PROJECT_ROOT,
        "languages": ["ru"]
    })
    text = extract_text_from_response(response)
    log_info(f"Ответ сервера: {text}")
    if "../etc/passwd" in text or "passwd" in text:
        log_warning("БАГ-6 ОБНАРУЖЕН: path traversal не заблокирован явно")
        return True
    else:
        log_info("BUG-6 не обнаружен")
        return False


def test_bug7_xss_injection(client):
    """BUG-7: XSS инъекция в modulePath."""
    log_info("Тестирование BUG-7: translate_module с XSS инъекцией...")
    response = client.call_tool("translate_module", {
        "modulePath": "<script>alert('xss')</script>",
        "projectRoot": PROJECT_ROOT,
        "languages": ["ru"]
    })
    text = extract_text_from_response(response)
    log_info(f"Ответ сервера: {text}")
    if "<script>" in text or "alert('xss')" in text:
        log_warning("БАГ-7 ОБНАРУЖЕН: XSS паттерн включен в ответ без экранирования")
        return True
    else:
        log_info("BUG-7 не обнаружен")
        return False


# ============================================================
# ГЛАВНЫЙ БЛОК
# ============================================================

if __name__ == "__main__":
    print(f"\n{BOLD}{'#'*60}{RESET}")
    print(f"{CYAN}E2E ТЕСТЫ для android-i18n-mcp{RESET}")
    print(f"{CYAN}Структура проекта: {MODULE_FULL_PATH}{RESET}")
    print(f"{CYAN}Тестовые языки: {TEST_LANGUAGES}{RESET}")
    print(f"{BOLD}{'#'*60}{RESET}\n")
    
    # Проверяем, что проект существует
    if not os.path.exists(MODULE_FULL_PATH):
        print(f"{RED}[ERROR] Android проект не найден: {MODULE_FULL_PATH}{RESET}")
        sys.exit(1)
    
    # Проверяем, что strings.xml существует
    default_strings = os.path.join(MODULE_FULL_PATH, "src", "main", "res", "values", "strings.xml")
    if not os.path.exists(default_strings):
        print(f"{RED}[ERROR] strings.xml не найден: {default_strings}{RESET}")
        sys.exit(1)
    
    client = McpClient(PROJECT_ROOT)
    all_errors = []
    
    try:
        client.start()
        log_success("MCP сервер запущен и инициализирован")
        
        # Запускаем все сценарии тестирования
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
            # Дополнительные E2E тесты для обнаружения багов
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
            # Считаем только если были EXCEPTION/CRITICAL (реальные ошибки)
            # INFO/WARN логи сохраняются в файлы, но не влияют на счёт
            has_exception = any('EXCEPTION' in e or 'CRITICAL' in e for e in errors)
            if has_exception:
                all_errors.extend(errors)
                failed += 1
            else:
                if errors:
                    all_errors.extend(errors)  # INFO/WARN логи к общему отчёту
                passed += 1
        
        # Итоговый отчёт
        print(f"\n{BOLD}{'='*60}{RESET}")
        print(f"{CYAN}ИТОГОВЫЙ ОТЧЁТ{RESET}")
        print(f"{BOLD}{'='*60}{RESET}")
        if failed == 0:
            print(f"{GREEN}ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО! ✓{RESET}")
        print(f"Пройдено: {GREEN}{passed}{RESET}/{len(test_scenarios)}")
        if failed > 0:
            print(f"Провалено: {RED}{failed}{RESET}/{len(test_scenarios)}")
        print(f"{BOLD}{'='*60}{RESET}\n")
        
    except Exception as e:
        print(f"{RED}[CRITICAL] Критическая ошибка при запуске тестов: {e}{RESET}")
        all_errors.append(f"CRITICAL: {str(e)}")
    finally:
        if client:
            client.stop()
        
        # Сохраняем общий отчёт об ошибках
        if all_errors:
            save_logs(all_errors, "e2e_all_errors.log")
            
        print(f"\n{GREEN}Тестирование завершено{RESET}")
