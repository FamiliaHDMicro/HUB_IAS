import sqlite3
import os
from datetime import datetime
from typing import Optional, Dict, Any

class OmniHubCore:
    """
    Núcleo do Qwen OmniHub.
    Gerencia modelos, permissões e histórico de forma segura e versionável.
    """
    
    def __init__(self, db_path: str = "data/hub_history.db"):
        self.db_path = db_path
        self._ensure_db()
        
    def _ensure_db(self):
        """Cria o banco de dados e tabelas se não existirem."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS interactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    user_role TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    input_summary TEXT,
                    output_summary TEXT,
                    tags TEXT
                )
            """)
            
    def log_interaction(self, role: str, action: str, inp: str, out: str, tags: str = ""):
        """Registra toda interação para histórico e aprendizado."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO interactions (timestamp, user_role, action_type, input_summary, output_summary, tags) VALUES (?, ?, ?, ?, ?, ?)",
                (datetime.now().isoformat(), role, action, inp[:200], out[:200], tags)
            )
            
    def check_permission(self, role: str, required_level: str) -> bool:
        """Sistema granular de permissões para colaboradores."""
        hierarchy = {"leitor": 0, "colaborador": 1, "admin": 2}
        return hierarchy.get(role, -1) >= hierarchy.get(required_level, 99)

    # --- API INTERNA PARA COLABORADORES ---
    
    def analyze_image(self, image_path: str, prompt: str, role: str = "admin") -> Dict[str, Any]:
        """Endpoint para análise visual (Qwen-VL)."""
        if not self.check_permission(role, "colaborador"):
            raise PermissionError("Permissão insuficiente para análise de imagem.")
            
        # TODO: Integrar Qwen-VL aqui
        result = {"status": "pending", "message": "Modelo VL será carregado sob demanda."}
        self.log_interaction(role, "analyze_image", prompt, str(result), "#visao")
        return result

    def generate_code(self, description: str, language: str = "python", role: str = "admin") -> Dict[str, Any]:
        """Endpoint para geração de código (Qwen-Coder)."""
        if not self.check_permission(role, "colaborador"):
            raise PermissionError("Permissão insuficiente para geração de código.")
            
        # TODO: Integrar Qwen-Coder aqui
        result = {"status": "pending", "message": "Modelo Coder será carregado sob demanda."}
        self.log_interaction(role, "generate_code", description, str(result), f"#codigo #{language}")
        return result