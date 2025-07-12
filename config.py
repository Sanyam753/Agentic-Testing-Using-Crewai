"""
Configuration and Global Variables for Adversarial Testing Application
"""
import os
import queue
import threading
from datetime import datetime

# Configuration constants
TESTING_MODEL_NAME = "qwen/qwen3-14b"
AUT_MODEL_NAME = "qwen/qwen3-8b"
BASE_URL = "http://127.0.0.1:1234/v1"
API_KEY = "san"
MODEL_LOAD_TIMEOUT = 300
MAX_ROUNDS = 4
TIMEOUT = 3600

# Default account data path
DEFAULT_ACCOUNT_DATA_PATH = r"C:\Users\Sanyam\Desktop\Covasent\Aut_Data\Banking\data.json"

# Global variables to store configuration
current_config = {
    'aut_model': AUT_MODEL_NAME,
    'account_data_path': DEFAULT_ACCOUNT_DATA_PATH
}

# Global variables for tracking execution
test_results = []
system_health = {
    "lm_studio": "unknown",
    "models": "unknown", 
    "data_access": "unknown"
}
recent_activity = []
performance_data = []
test_categories_stats = {"confidentiality": 0, "integrity": 0, "inference": 0, "toxicity": 0}

current_execution = None
execution_logs = []
log_queue = queue.Queue()
execution_lock = threading.Lock()

# Add coding test specific global variables
coding_test_results = []
current_coding_execution = None
generated_codes_data = []
code_reviews_data = []
final_evaluation_data = None

# Add global variables for test file management
test_files_data = {
    "prompts_file": None,
    "responses_file": None,
    "report_file": None,
    "prompts_content": None,
    "responses_content": None,
    "report_content": None
}