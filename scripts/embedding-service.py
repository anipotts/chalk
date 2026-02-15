#!/usr/bin/env python3
"""Local embedding service — nomic-embed-text-v1.5 on GPU.

Runs alongside whisperx-service.py on the Courant CUDA server.
Produces 1024-dim embeddings matching the Supabase knowledge_embeddings schema.

Usage:
    pip install fastapi uvicorn sentence-transformers
    python scripts/embedding-service.py

Endpoints:
    POST /embed   — embed a list of texts
    GET  /health  — health check
"""
import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI()
_model = None

MODEL_NAME = "nomic-ai/nomic-embed-text-v1.5"
EMBED_DIM = 1024


def get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        print(f"[embedding] Loading {MODEL_NAME} on GPU...")
        _model = SentenceTransformer(MODEL_NAME, trust_remote_code=True)
        _model = _model.to("cuda")
        print("[embedding] Model ready.")
    return _model


class EmbedRequest(BaseModel):
    texts: list[str]
    input_type: str = "document"  # "document" or "query"


@app.post("/embed")
async def embed(req: EmbedRequest):
    if not req.texts:
        raise HTTPException(400, "Empty texts list")
    if len(req.texts) > 256:
        raise HTTPException(400, "Max 256 texts per request")

    model = get_model()

    # nomic-embed-text-v1.5 uses task prefixes
    prefix = "search_document: " if req.input_type == "document" else "search_query: "
    prefixed = [prefix + t for t in req.texts]

    embeddings = model.encode(prefixed, normalize_embeddings=True, show_progress_bar=False)

    return {
        "embeddings": embeddings.tolist(),
        "model": MODEL_NAME,
        "dimensions": EMBED_DIM,
    }


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_NAME, "dimensions": EMBED_DIM}


# Optional: register in Supabase service_registry on startup
async def register_service():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[embedding] No Supabase env vars — skipping service registration")
        return

    import asyncio
    import json
    from urllib.request import Request, urlopen

    service_url = f"http://{os.uname().nodename}:8766"
    data = json.dumps({
        "service_name": "embedding",
        "url": service_url,
        "updated_at": "now()",
    }).encode()

    try:
        req = Request(
            f"{url}/rest/v1/service_registry",
            data=data,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            method="POST",
        )
        urlopen(req, timeout=5)
        print(f"[embedding] Registered as '{service_url}' in service_registry")
    except Exception as e:
        print(f"[embedding] Registration failed: {e}")


@app.on_event("startup")
async def startup():
    get_model()  # warm up
    await register_service()


if __name__ == "__main__":
    get_model()  # warm up on startup
    uvicorn.run(app, host="0.0.0.0", port=8766)
