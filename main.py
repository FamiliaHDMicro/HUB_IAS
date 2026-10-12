import gradio as gr
from core import OmniHubCore

# Inicializa o núcleo (banco de dados e permissões)
hub = OmniHubCore()

def processar_comando(texto: str, imagem_path: str, role: str):
    """
    Roteador inteligente da interface.
    Decide qual função do core chamar baseado no input.
    """
    try:
        if imagem_path:
            # Se houver imagem, aciona Qwen-VL via core
            resultado = hub.analyze_image(imagem_path, texto, role=role)
            return f"🖼️ **Análise Visual:**\n{resultado.get('message', 'Processando...')}"
        
        elif "código" in texto.lower() or "code" in texto.lower():
            # Se mencionar código, aciona Qwen-Coder
            resultado = hub.generate_code(texto, role=role)
            return f"💻 **Geração de Código:**\n{resultado.get('message', 'Processando...')}"
        
        else:
            # Fallback para texto puro (futuro Qwen-Text)
            return f"💬 **Modo Texto:**\nComando recebido: '{texto}'\n(Role: {role})"
            
    except PermissionError as e:
        return f" **Erro de Permissão:** {str(e)}"
    except Exception as e:
        return f"❌ **Erro Interno:** {str(e)}"

# --- INTERFACE GRADIO ---
with gr.Blocks(title="Qwen OmniHub", theme=gr.themes.Soft()) as demo:
    gr.Markdown("# 🧠 Qwen OmniHub v0.1")
    gr.Markdown("Interface local segura | Versionada no Git | Colaborativa")
    
    with gr.Row():
        with gr.Column(scale=2):
            input_text = gr.Textbox(
                label="Comando / Prompt", 
                placeholder="Ex: Analise esta imagem / Gere código Python para...",
                lines=3
            )
            input_img = gr.Image(type="filepath", label="Imagem (Opcional)")
            
            role_selector = gr.Dropdown(
                choices=["admin", "colaborador", "leitor"],
                value="admin",
                label="Nível de Acesso Atual"
            )
            
            btn_executar = gr.Button("▶ Executar", variant="primary")
            
        with gr.Column(scale=3):
            output_display = gr.Markdown(label="Resposta do Hub")

    btn_executar.click(
        fn=processar_comando,
        inputs=[input_text, input_img, role_selector],
        outputs=output_display
    )

if __name__ == "__main__":
    print("🚀 Iniciando Qwen OmniHub em http://127.0.0.1:7860")
    demo.launch(server_name="127.0.0.1", server_port=7860)