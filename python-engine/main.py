import sys
import os
import json
import logging
import traceback
import hashlib
import threading
import glob
import multiprocessing
from concurrent.futures import ThreadPoolExecutor, as_completed
from engine.face_processor import face_engine
from engine.file_classifier import evaluate_image, generate_target_path, copy_or_move
from engine.exif_reader import get_exif_year

# Basic logging setup
logging.basicConfig(
    filename="photosift_engine.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

def send_response(rpc_id, result=None, error=None):
    """Sends a JSON-RPC 2.0 response to stdout."""
    response = {"jsonrpc": "2.0", "id": rpc_id}
    if error:
        response["error"] = error
    else:
        response["result"] = result
    
    # Must write exactly one line of JSON per message, followed by newline, and flush
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()

def send_notification(method, params):
    """Sends a JSON-RPC 2.0 notification (no ID) to stdout."""
    notification = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params
    }
    sys.stdout.write(json.dumps(notification) + "\n")
    sys.stdout.flush()

# In-memory store for reference embeddings
reference_store = {}
sorting_active = False
pause_event = threading.Event()
pause_event.set()  # Start unpaused

def run_sorting_task(params):
    global sorting_active
    sorting_active = True
    pause_event.set()  # Ensure not paused at start
    
    source_folder = params.get("source_folder")
    target_folder = params.get("target_folder")
    threshold = params.get("threshold", 0.45)
    threads = params.get("threads", 4)
    recursive = params.get("recursive", False)
    
    logging.info(f"Starting sort from {source_folder} to {target_folder} with threshold {threshold} and {threads} threads")
    
    try:
        pattern = "**/*" if recursive else "*"
        search_path = os.path.join(source_folder, pattern)
        all_files = glob.glob(search_path, recursive=recursive)
        
        valid_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
        files = [f for f in all_files if os.path.isfile(f) and os.path.splitext(f)[1].lower() in valid_exts]
        
        total = len(files)
        current = 0
        
        stats = {
            "matched": 0, "total": 0, "solo": 0, "together": 0, "group": 0,
            "no_people": 0, "junk": 0, "others": 0, "duplicates": 0,
            "small": 0, "unrecognized": 0, "processed": 0, "errors": 0
        }
        years_found = set()
        
        send_notification("progress", {"phase": "scanning", "current": 0, "total": total, "stats": stats})
        
        seen_hashes = set()
        hash_lock = threading.Lock()
        
        def process_file(file_path):
            pause_event.wait()  # Block if paused
            if not sorting_active:
                return None, ""
                
            try:
                category, is_duplicate, f_hash = evaluate_image(file_path, params, reference_store, threshold)
                
                if params.get("detect_duplicates", False) and f_hash:
                    with hash_lock:
                        if f_hash in seen_hashes:
                            category = "Duplicates"
                        else:
                            seen_hashes.add(f_hash)
                            
                final_path = generate_target_path(file_path, target_folder, category, params)
                copy_or_move(file_path, final_path, move=params.get("move_files", False))
                
                # Extract year for tree tracking
                year = ""
                if params.get("sort_by_year", False):
                    year = get_exif_year(file_path) or ""
                
                return category, year
            except Exception as e:
                logging.error(f"Error processing {file_path}: {e}")
                return "Error", ""

        with ThreadPoolExecutor(max_workers=threads) as executor:
            futures = {executor.submit(process_file, f): f for f in files}
            for future in as_completed(futures):
                if not sorting_active:
                    break
                pause_event.wait()  # Block here while paused
                    
                current += 1
                cat, year = future.result()
                if cat is None:
                    continue
                
                stats["total"] += 1
                stats["processed"] += 1
                if year:
                    years_found.add(year)
                if cat == "No Faces":
                    stats["no_people"] += 1
                elif cat == "Junk":
                    stats["junk"] += 1
                elif cat == "Small":
                    stats["small"] += 1
                elif cat == "Others":
                    stats["others"] += 1
                elif cat == "Unrecognized":
                    stats["unrecognized"] += 1
                elif cat == "Duplicates":
                    stats["duplicates"] += 1
                elif cat == "Error":
                    stats["errors"] += 1
                else:
                    # Anything else is a successful match! (Solo, Group, Together, or specific PersonName)
                    stats["matched"] += 1
                    if cat == "Group":
                        stats["group"] += 1
                    elif cat == "Together":
                        stats["together"] += 1
                    else:
                        stats["solo"] += 1
                    
                send_notification("progress", {"phase": "copying", "current": current, "total": total, "stats": stats})
                
        # Scan the actual target folder to build real tree
        def scan_folder_tree(root_path):
            """Recursively scan folder and return tree with file counts."""
            tree = []
            try:
                for entry in sorted(os.scandir(root_path), key=lambda e: e.name):
                    if entry.is_dir():
                        children = scan_folder_tree(entry.path)
                        # Count files in this dir (non-recursive direct count)
                        direct_files = sum(1 for f in os.scandir(entry.path) if f.is_file())
                        tree.append({
                            "name": entry.name,
                            "count": direct_files,
                            "children": children
                        })
            except Exception as e:
                logging.error(f"Error scanning folder {root_path}: {e}")
            return tree
        
        folder_tree = scan_folder_tree(target_folder)
        final_stats = {**stats, "folder_tree": folder_tree}
        send_notification("progress", {"phase": "done", "current": current, "total": total, "stats": final_stats})
        logging.info("Sorting completed.")
        
    except Exception as e:
        err = traceback.format_exc()
        logging.error(f"Sorting error: {err}")
        send_notification("error", {"message": str(e)})
    finally:
        sorting_active = False

def handle_request(req):
    rpc_id = req.get("id")
    method = req.get("method")
    params = req.get("params", {})

    logging.info(f"Received request: method={method} id={rpc_id}")

    try:
        if method == "ping":
            send_response(rpc_id, result="pong")
        
        elif method == "init":
            logging.info("Initializing models...")
            success, msg = face_engine.initialize()
            if success:
                send_response(rpc_id, result={"status": "ok", "message": msg})
            else:
                send_response(rpc_id, error={"code": -32001, "message": msg})

        elif method == "add_reference":
            path = params.get("path")
            logging.info(f"Adding reference: {path}")
            try:
                embeddings = face_engine.extract_faces(path)
                if not embeddings:
                    send_response(rpc_id, error={"code": -32002, "message": "No faces detected"})
                    return
                
                # Generate stable ID from path
                ref_id = f"ref_{hashlib.md5(path.encode('utf-8')).hexdigest()}"
                
                # Store it
                reference_store[ref_id] = embeddings
                
                send_response(rpc_id, result={
                    "status": "ok",
                    "reference_id": ref_id,
                    "has_multiple_faces": len(embeddings) > 1,
                    "faces_found": len(embeddings)
                })
            except Exception as e:
                err = traceback.format_exc()
                logging.error(f"Error adding reference: {err}")
                send_response(rpc_id, error={"code": -32002, "message": str(e)})

        elif method == "remove_reference":
            ref_id = params.get("id")
            logging.info(f"Removing reference: {ref_id}")
            if ref_id in reference_store:
                del reference_store[ref_id]
            send_response(rpc_id, result={"status": "ok"})

        elif method == "clear_references":
            reference_store.clear()
            logging.info("All references cleared")
            send_response(rpc_id, result={"status": "ok"})
            
        elif method == "start_sorting":
            logging.info("Starting sort process...")
            sort_thread = threading.Thread(target=run_sorting_task, args=(params,))
            sort_thread.start()
            send_response(rpc_id, result={"status": "started"})
            
        elif method == "pause":
            pause_event.clear()  # Block the sorting loop
            send_response(rpc_id, result={"status": "paused"})
            
        elif method == "resume":
            pause_event.set()  # Unblock the sorting loop
            send_response(rpc_id, result={"status": "resumed"})

        elif method == "stop":
            global sorting_active
            sorting_active = False
            pause_event.set()  # Unblock if paused, so thread can exit
            send_response(rpc_id, result={"status": "stopped"})
        
        elif method == "system_info":
            try:
                c_count = multiprocessing.cpu_count()
            except Exception:
                c_count = 4
            send_response(rpc_id, result={
                "gpu_available": False,
                "gpu_name": "Mock GPU",
                "cpu_count": c_count
            })

        else:
            logging.warning(f"Method not found: {method}")
            send_response(rpc_id, error={"code": -32601, "message": "Method not found"})

    except Exception as e:
        err_msg = traceback.format_exc()
        logging.error(f"Error handling request: {err_msg}")
        send_response(rpc_id, error={"code": -32000, "message": str(e), "data": err_msg})

def main():
    logging.info("Python Engine started. Waiting for JSON-RPC messages on stdin...")
    
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
            
        try:
            req = json.loads(line)
            handle_request(req)
        except json.JSONDecodeError as e:
            logging.error(f"Failed to parse JSON: {line} - Error: {e}")
            # Cannot send proper RPC response without ID, but we try to notify
            send_response(None, error={"code": -32700, "message": "Parse error"})
        except Exception as e:
            logging.error(f"Unexpected error: {e}")

if __name__ == "__main__":
    main()
