import json
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any


SUPPORTED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm"}
VOICE_AUDIO_DIR = Path("outputs/voice_audio")
VOICE_TRANSCRIPT_DIR = Path("outputs/voice_transcripts")


def save_uploaded_audio(uploaded_audio: Any, suffix: str | None = None) -> Path:
    """Persist a Streamlit mic/upload object to a temporary audio file."""
    inferred_suffix = suffix or Path(getattr(uploaded_audio, "name", "")).suffix or ".wav"
    if inferred_suffix.lower() not in SUPPORTED_AUDIO_EXTENSIONS:
        inferred_suffix = ".wav"

    with tempfile.NamedTemporaryFile(delete=False, suffix=inferred_suffix) as temp_file:
        temp_file.write(_read_audio_bytes(uploaded_audio))
        return Path(temp_file.name)


def save_audio_as_wav(uploaded_audio: Any, output_dir: str | Path = VOICE_AUDIO_DIR) -> Path:
    """Persist Streamlit audio input/upload data as a WAV file for Whisper."""
    audio_dir = Path(output_dir)
    audio_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    source_suffix = Path(getattr(uploaded_audio, "name", "")).suffix.lower() or ".wav"
    if source_suffix not in SUPPORTED_AUDIO_EXTENSIONS:
        source_suffix = ".wav"

    source_path = audio_dir / f"voice_input_{timestamp}{source_suffix}"
    source_path.write_bytes(_read_audio_bytes(uploaded_audio))

    if source_path.suffix.lower() == ".wav":
        return source_path

    wav_path = audio_dir / f"voice_input_{timestamp}.wav"
    _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(source_path),
            "-ac",
            "1",
            "-ar",
            "16000",
            str(wav_path),
        ]
    )
    return wav_path


def normalize_audio_for_whisper(audio_path: str | Path, output_dir: str | Path = VOICE_AUDIO_DIR) -> Path:
    """Create a mono 16 kHz normalized WAV file when ffmpeg is available."""
    path = validate_audio_file(audio_path)
    audio_dir = Path(output_dir)
    audio_dir.mkdir(parents=True, exist_ok=True)

    normalized_path = audio_dir / f"{path.stem}_normalized.wav"
    _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(path),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-af",
            "loudnorm",
            str(normalized_path),
        ]
    )
    return normalized_path


def save_transcript_debug(
    transcription: dict[str, Any],
    output_dir: str | Path = VOICE_TRANSCRIPT_DIR,
) -> Path:
    """Store the latest voice transcript data for debugging and replay."""
    transcript_dir = Path(output_dir)
    transcript_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    debug_path = transcript_dir / f"transcript_{timestamp}.json"
    debug_path.write_text(json.dumps(transcription, indent=2, ensure_ascii=False))
    return debug_path


def _read_audio_bytes(audio_source: Any) -> bytes:
    if isinstance(audio_source, bytes):
        return audio_source
    if isinstance(audio_source, bytearray):
        return bytes(audio_source)
    if hasattr(audio_source, "getbuffer"):
        return bytes(audio_source.getbuffer())
    if hasattr(audio_source, "read"):
        data = audio_source.read()
        return data if isinstance(data, bytes) else bytes(data)
    raise TypeError("Unsupported audio source. Expected bytes, file-like object, or Streamlit upload.")


def validate_audio_file(audio_path: str | Path) -> Path:
    """Validate an audio path before transcription."""
    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {path}")
    if not path.is_file():
        raise ValueError(f"Audio path is not a file: {path}")
    if path.suffix.lower() not in SUPPORTED_AUDIO_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_AUDIO_EXTENSIONS))
        raise ValueError(f"Unsupported audio format '{path.suffix}'. Supported formats: {supported}")
    return path


def _run_ffmpeg(args: list[str]) -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is required to convert or normalize audio before transcription.")

    completed = subprocess.run(args, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "ffmpeg failed while processing audio.")


def build_voice_order_payload(transcription: dict[str, Any] | str, intent: dict[str, Any]) -> dict[str, Any]:
    """Combine transcript and intent output for downstream NutriOrderAI calls."""
    transcript_text = transcription if isinstance(transcription, str) else transcription.get("text", "")
    language = None if isinstance(transcription, str) else transcription.get("language")

    return {
        "source": "voice",
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "transcript": transcript_text,
        "language": language,
        "agent_input": intent,
    }


def voice_order_payload_to_json(payload: dict[str, Any]) -> str:
    """Format a voice order payload as readable JSON."""
    return json.dumps(payload, indent=2, ensure_ascii=False)
