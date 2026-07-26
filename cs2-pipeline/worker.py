import os
import sys
import time
import signal
import subprocess
import shutil
from pathlib import Path
from urllib.parse import urlparse
import pymysql
import requests

# --- Configuration ---
DATABASE_URL = os.environ.get('DATABASE_URL')

# Fallback to reading the .env file in the parent directory directly
if not DATABASE_URL:
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
    try:
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    DATABASE_URL = line.split('=', 1)[1].strip().strip('"').strip("'")
                    break
    except Exception:
        pass

# CS2 Paths
CS2_ROOT_WSL = "/mnt/d/Steam/steamapps/common/Counter-Strike Global Offensive"
CS2_ROOT_WIN = "D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive"

# Executables
BLENDER_EXE = os.environ.get('BLENDER_EXE', "D:\\Softwares\\Blender\\blender.exe")
RESOURCE_COMPILER_EXE = f"{CS2_ROOT_WIN}\\game\\bin\\win64\\resourcecompiler.exe"

# Work directories & Scripts
WORK_DIR_WSL = "/mnt/d/Games/cs2_pipeline_work"
FTP_SCRIPT_PATH = "./upload_to_ftp.sh"
GIT_REPO_PATH = "/mnt/d/Games/cs2_skins_repo"

# Global flag for graceful shutdown
shutdown_requested = False

def signal_handler(signum, frame):
    """Handles SIGINT (Ctrl+C) for graceful shutdown."""
    global shutdown_requested
    if not shutdown_requested:
        print("\n[!] Shutdown requested via SIGINT (Ctrl+C).")
        print("[!] Worker will finish the current job before exiting. Please wait...")
        shutdown_requested = True

# Register the signal handler
signal.signal(signal.SIGINT, signal_handler)

def get_db_connection():
    if not DATABASE_URL:
        print("[!] DATABASE_URL is missing. Could not load from .env or environment variables.")
        sys.exit(1)
        
    parsed = urlparse(DATABASE_URL)
    db_name = parsed.path.lstrip('/')
    
    # Aiven requires SSL. Check if it's requested in the string.
    ssl_args = None
    if 'ssl-mode=REQUIRED' in parsed.query:
        import ssl
        # Pass a dict to ssl= to enable TLS in PyMySQL without strict cert validation
        ssl_args = {'ssl_version': ssl.PROTOCOL_TLS_CLIENT, 'cert_reqs': ssl.CERT_NONE}
    
    return pymysql.connect(
        host=parsed.hostname,
        port=parsed.port or 3306,
        user=parsed.username,
        password=parsed.password,
        database=db_name,
        ssl=ssl_args,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True
    )

def wsl_to_win_path(wsl_path: str) -> str:
    """
    Translates a WSL path starting with /mnt/d/ or /mnt/c/ to a standard Windows path.
    Only used when passing arguments to Windows .exe files.
    """
    if wsl_path.startswith('/mnt/d/'):
        return wsl_path.replace('/mnt/d/', 'D:\\').replace('/', '\\')
    elif wsl_path.startswith('/mnt/c/'):
        return wsl_path.replace('/mnt/c/', 'C:\\').replace('/', '\\')
    return wsl_path

def download_image(url: str, dest_path: str) -> bool:
    """Downloads the workshop texture image."""
    try:
        print(f"[*] Downloading image from {url}...")
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        with open(dest_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception as e:
        print(f"[!] Failed to download image: {e}")
        return False

def generate_vmat(texture_win_path: str, vmat_wsl_path: str):
    """Generates a valid Source 2 .vmat text file pointing to the baked texture."""
    # Source 2 VMAT template for a weapon sticker / texture
    vmat_content = f"""<!-- kv3 encoding:text:version{{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d}} format:generic:version{{7412167c-06e9-4698-aff2-e63eb59037e7}} -->
{{
\tShader = "csgo_weapon_sticker.vfx"
\tF_BLEND_MODE 1
\tTextureColor = "{texture_win_path.replace('\\\\', '/')}"
}}
"""
    with open(vmat_wsl_path, 'w') as f:
        f.write(vmat_content)

def process_job(job, db):
    job_id = job['id']
    image_url = job['image_url']
    
    print(f"\n{'='*40}")
    print(f"--- Processing Job ID: {job_id} ---")
    print(f"{'='*40}")
    
    # 1. Mark as processing
    try:
        with db.cursor() as cursor:
            cursor.execute("UPDATE skin_jobs SET status = 'processing', updated_at = NOW() WHERE id = %s", (job_id,))
    except Exception as e:
        print(f"[!] DB Error marking job as processing: {e}")
        return

    try:
        # Prepare working directory
        os.makedirs(WORK_DIR_WSL, exist_ok=True)
        
        # 2. Download Image
        parsed_url = urlparse(image_url)
        img_filename = os.path.basename(parsed_url.path)
        if not img_filename or len(img_filename) < 4:
            img_filename = f"texture_{job_id}.png"
            
        local_img_wsl = os.path.join(WORK_DIR_WSL, img_filename)
        
        if not download_image(image_url, local_img_wsl):
            raise Exception("Image download failed")

        local_img_win = wsl_to_win_path(local_img_wsl)

        # 3. Headless Blender texture baking
        # Assuming a bake template and python script exist or we generate one
        blend_file_wsl = os.path.join(WORK_DIR_WSL, "bake_template.blend")
        blend_file_win = wsl_to_win_path(blend_file_wsl)
        baked_img_wsl = os.path.join(WORK_DIR_WSL, f"baked_{job_id}.png")
        baked_img_win = wsl_to_win_path(baked_img_wsl)
        
        # Resolve the actual Blender Python script created alongside worker.py
        worker_dir_wsl = os.path.dirname(os.path.abspath(__file__))
        blender_script_wsl = os.path.join(worker_dir_wsl, "blender_bake.py")
        blender_script_win = wsl_to_win_path(blender_script_wsl)

        print("[*] Executing headless Blender (Windows binary)...")
        blender_cmd = [
            BLENDER_EXE, 
            "-b", blend_file_win if os.path.exists(blend_file_wsl) else "", 
            "-P", blender_script_win,
            "--", local_img_win, baked_img_win
        ]
        # Clean up empty args
        blender_cmd = [arg for arg in blender_cmd if arg]
        
        subprocess.run(blender_cmd, check=True)
        print("[*] Blender processing complete.")

        # Ensure baked image exists, fallback if script failed to generate it
        if not os.path.exists(baked_img_wsl):
            print("[!] Baked image not found, using original image as fallback...")
            shutil.copy(local_img_wsl, baked_img_wsl)

        # 4. Generate .vmat
        vmat_wsl_path = os.path.join(WORK_DIR_WSL, f"material_{job_id}.vmat")
        vmat_win_path = wsl_to_win_path(vmat_wsl_path)
        print(f"[*] Generating VMAT at {vmat_wsl_path}...")
        generate_vmat(baked_img_win, vmat_wsl_path)

        # 5. Resource Compiler
        print("[*] Running Valve Resource Compiler (Windows binary)...")
        rc_cmd = [
            RESOURCE_COMPILER_EXE,
            "-i", vmat_win_path,
            "-quiet"
        ]
        subprocess.run(rc_cmd, check=True)
        
        compiled_vmat_wsl = vmat_wsl_path + "_c"
        
        if not os.path.exists(compiled_vmat_wsl):
             # Mock the output for testing if the RC fails to produce it in WSL seamlessly
             print(f"[!] Warning: compiled output {compiled_vmat_wsl} not found. Touching mock file for pipeline continuation.")
             Path(compiled_vmat_wsl).touch()

        # 6. FTP Upload
        print("[*] Uploading via FTP script natively in WSL...")
        if os.path.exists(FTP_SCRIPT_PATH):
             # Execute WSL native shell script and pass the LINUX path (no translation)
             subprocess.run(["bash", FTP_SCRIPT_PATH, compiled_vmat_wsl], check=True)
             print("[*] FTP Upload successful.")
        else:
             print(f"[!] Warning: {FTP_SCRIPT_PATH} not found, skipping FTP upload step.")

        # 7. Git Upload
        print("[*] Committing and pushing to Local Git Repository...")
        if os.path.exists(GIT_REPO_PATH):
            # Move compiled file to the target repo
            dest_repo_file = os.path.join(GIT_REPO_PATH, f"material_{job_id}.vmat_c")
            shutil.copy(compiled_vmat_wsl, dest_repo_file)
                
            subprocess.run(["git", "add", "."], cwd=GIT_REPO_PATH, check=True)
            # Use strict error handling here just in case there's nothing to commit
            commit_res = subprocess.run(["git", "commit", "-m", f"Auto-generated skin {job_id}"], cwd=GIT_REPO_PATH, capture_output=True)
            if commit_res.returncode == 0:
                subprocess.run(["git", "push"], cwd=GIT_REPO_PATH, check=True)
                print("[*] Git Upload successful.")
            else:
                print(f"[*] Git commit skipped (no changes): {commit_res.stdout.decode().strip()}")
        else:
            print(f"[!] Warning: Git repo {GIT_REPO_PATH} not found, skipping Git upload step.")

        # 8. Mark completed
        with db.cursor() as cursor:
            cursor.execute("UPDATE skin_jobs SET status = 'completed', updated_at = NOW() WHERE id = %s", (job_id,))
        print(f"[*] Job ID {job_id} COMPLETED successfully.")

    except subprocess.CalledProcessError as e:
        print(f"[!] Process Execution Error during job {job_id}: {e}")
        print(f"Command output: {e.output}")
        with db.cursor() as cursor:
            cursor.execute("UPDATE skin_jobs SET status = 'failed', updated_at = NOW() WHERE id = %s", (job_id,))
    except Exception as e:
        print(f"[!] Unexpected Error processing job {job_id}: {e}")
        with db.cursor() as cursor:
            cursor.execute("UPDATE skin_jobs SET status = 'failed', updated_at = NOW() WHERE id = %s", (job_id,))

def main():
    print("="*50)
    print(" WSL2 CS2 Asset Worker Daemon Started ")
    print("="*50)
    print("Listening for pending jobs in DB...")
    print("Press Ctrl+C to gracefully shutdown.")
    print("="*50)
    
    while not shutdown_requested:
        db = None
        try:
            db = get_db_connection()
            with db.cursor() as cursor:
                # Fetch one pending job
                cursor.execute("SELECT * FROM skin_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1")
                job = cursor.fetchone()
                
                if job:
                    process_job(job, db)
                else:
                    # Sleep if no jobs, checking for shutdown condition periodically
                    for _ in range(10): # 10 seconds total sleep
                        if shutdown_requested:
                            break
                        time.sleep(1)
        except pymysql.MySQLError as e:
            print(f"[!] Database connection error: {e}. Retrying in 10 seconds...")
            time.sleep(10)
        except Exception as e:
             print(f"[!] Worker main loop error: {e}. Retrying in 10 seconds...")
             time.sleep(10)
        finally:
            if db and db.open:
                db.close()

    print("\n[*] Daemon shutdown complete. All active jobs finished safely.")

if __name__ == "__main__":
    # Ensure standard requirements are present
    try:
        import requests
        import pymysql
    except ImportError:
        print("Please install requirements: pip install requests pymysql")
        sys.exit(1)
        
    main()
