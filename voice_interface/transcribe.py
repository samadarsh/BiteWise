from pathlib import Path
from typing import Any

from voice_interface.audio_utils import (
    normalize_audio_for_whisper,
    save_transcript_debug,
    validate_audio_file,
)


def transcribe_audio(
    audio_path: str | Path,
    model_name: str = "tiny",
    normalize: bool = True,
    store_debug: bool = True,
) -> dict[str, Any]:
    """Transcribe an audio file with Whisper and return plain backend data."""
    path = validate_audio_file(audio_path)
    whisper_path = path
    normalized_path = None

    if normalize:
        normalized_path = normalize_audio_for_whisper(path)
        whisper_path = normalized_path

    try:
        import whisper
    except ImportError as exc:
        raise RuntimeError(
            "Whisper is not installed. Install openai-whisper to enable voice transcription."
        ) from exc

    model = whisper.load_model(model_name)
    result = model.transcribe(str(whisper_path))

    transcription = {
        "text": result.get("text", "").strip(),
        "language": result.get("language"),
        "segments": result.get("segments", []),
        "audio_path": str(path),
        "whisper_audio_path": str(whisper_path),
        "normalized_audio_path": str(normalized_path) if normalized_path else None,
        "model": model_name,
    }

    if store_debug:
        transcription["debug_path"] = str(save_transcript_debug(transcription))

    return transcription
