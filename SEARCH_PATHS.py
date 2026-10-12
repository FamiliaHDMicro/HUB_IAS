import os
import json
import time
import requests
from pathlib import Path

# ==========================================
# CONFIGURAÇÃO DO USUÁRIO (EDITE AQUI)
# ==========================================
ADMIN_TOKEN = "SEU_TOKEN_AQUI"  # Cole seu token real
API_URL = "https://hub-ias.hdmicro-ml.workers.dev/api/projects"

# ONDE PROCURAR SEUS PROJETOS (Adicione seus caminhos reais)
SEARCH_PATHS = [
    r"C:\Users\HDMICRO\Documents\Coding",
    r"D:\Projetos",
    r"E:\Backup_Codigo",
    # Adicione mais caminhos conforme necessário
]

# EXTENSÕES QUE DEFINEM UM PROJETO
PROJECT_EXTENSIONS = {'.py', '.js', '.ts', '.html', '.css', '.cpp', '.c', '.h', '.ino', '.java', '.rb', '.go', '.rs'}

# PASTAS A IGNORAR
IGNORE_FOLDERS = {'node_modules', '__pycache__', '.git', 'venv', 'env', '.venv', 'dist', 'build', '.next'}

# ARQUIVO DE CONTROLE DE PROGRESSO (NUNCA APAGUE MANUALMENTE)
PROGRESS_FILE = "migration_progress.json"

# ==========================================
# LÓGICA DE MIGRAÇÃO
# ==========================================

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    return {"processed": [], "failed": []}

def save_progress(progress):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, indent=2)

def is_project_folder(folder_path):
    """Verifica se a pasta contém arquivos de código válidos."""
    try:
        for root, dirs, files in os.walk(folder_path, topdown=True):
            # Remove pastas ignoradas da varredura
            dirs[:] = [d for d in dirs if d not in IGNORE_FOLDERS]
            
            for file in files:
                ext = Path(file).suffix.lower()
                if ext in PROJECT_EXTENSIONS:
                    return True
    except PermissionError:
        pass
    return False

def send_to_cloud(project_name, description="Migrado automaticamente"):
    """Envia projeto para a API com retry simples."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {ADMIN_TOKEN}"
    }
    payload = {
        "name": project_name,
        "description": description,
        "status_label": "Criados",  # Todos começam arquivados
        "github_branch": ""
    }
    
    for attempt in range(3):
        try:
            resp = requests.post(API_URL, json=payload, headers=headers, timeout=10)
            if resp.status_code == 201:
                return True, resp.json().get("id")
            elif resp.status_code == 429:  # Rate limit
                time.sleep(2)
            else:
                return False, resp.text
        except Exception as e:
            time.sleep(1)
    return False, "Falha após 3 tentativas"

def main():
    print("🚀 Iniciando Migração OmniHub...")
    progress = load_progress()
    total_found = 0
    total_sent = len(progress["processed"])
    total_failed = len(progress["failed"])

    for search_path in SEARCH_PATHS:
        if not os.path.exists(search_path):
            print(f"⚠️ Caminho não encontrado: {search_path}")
            continue
            
        print(f"\n🔍 Varrendo: {search_path}")
        for root, dirs, files in os.walk(search_path, topdown=True):
            dirs[:] = [d for d in dirs if d not in IGNORE_FOLDERS]
            
            # Verifica apenas pastas de nível 1 ou 2 para evitar profundidade excessiva
            depth = root.replace(search_path, '').count(os.sep)
            if depth > 2: 
                continue
                
            if is_project_folder(root):
                folder_name = os.path.basename(root)
                
                # Evita duplicatas
                if folder_name in progress["processed"] or folder_name in progress["failed"]:
                    continue
                    
                total_found += 1
                print(f"   [+] Encontrado: {folder_name}")
                
                success, msg = send_to_cloud(folder_name)
                if success:
                    progress["processed"].append(folder_name)
                    total_sent += 1
                    print(f"       ✅ Enviado (ID: {msg})")
                else:
                    progress["failed"].append({"name": folder_name, "error": str(msg)})
                    total_failed += 1
                    print(f"       ❌ Falha: {msg}")
                
                # Salva progresso a cada envio (segurança contra quedas)
                save_progress(progress)
                
                # Pequena pausa para não sobrecarregar a API
                time.sleep(0.5)

    print(f"\n🏁 MIGRAÇÃO CONCLUÍDA!")
    print(f"    Novos encontrados nesta execução: {total_found}")
    print(f"   ☁️ Total enviados na nuvem: {total_sent}")
    print(f"   ⚠️ Falhas acumuladas: {total_failed}")
    print(f"   💾 Progresso salvo em: {PROGRESS_FILE}")

if __name__ == "__main__":
    main()