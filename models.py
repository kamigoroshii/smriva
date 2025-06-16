# models.py
from transformers import pipeline, WhisperProcessor, WhisperForConditionalGeneration
import torch
import soundfile as sf
import librosa
import os
import subprocess

# --- FFmpeg Configuration ---
# IMPORTANT: Ensure 'ffmpeg' is in your system's PATH.
# If not, provide the full path to ffmpeg.exe here.
# Example for Windows: FFMPEG_PATH = "C:\\path\\to\\ffmpeg\\bin\\ffmpeg.exe"
FFMPEG_PATH = "ffmpeg" # Assumes ffmpeg is in your system PATH

# --- Whisper ASR Model ---
WHISPER_MODEL_NAME = "openai/whisper-base"
whisper_processor = None
whisper_model = None

def load_whisper_model():
    global whisper_processor, whisper_model
    if whisper_processor is None or whisper_model is None:
        print(f"Loading Whisper model: {WHISPER_MODEL_NAME}...")
        whisper_processor = WhisperProcessor.from_pretrained(WHISPER_MODEL_NAME)
        whisper_model = WhisperForConditionalGeneration.from_pretrained(WHISPER_MODEL_NAME)
        if not torch.cuda.is_available():
            whisper_model.to('cpu')
        print("Whisper model loaded.")
    return whisper_processor, whisper_model

def convert_audio_ffmpeg(input_path, output_path, target_sr=16000):
    """
    Converts an audio file to a standard WAV format (16kHz, mono) using FFmpeg.
    """
    print(f"Converting audio with FFmpeg: {input_path} to {output_path}")
    command = [
        FFMPEG_PATH,
        "-i", input_path,  # Input file
        "-ar", str(target_sr), # Audio sample rate (16kHz for Whisper)
        "-ac", "1",        # Audio channels (1 for mono)
        "-c:a", "pcm_s16le", # Audio codec (PCM 16-bit signed 16-bit little-endian for WAV)
        "-y",              # Overwrite output file if it exists
        output_path        # Output file
    ]
    try:
        result = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"FFmpeg conversion successful: {output_path}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg error during conversion (Exit Code {e.returncode}):")
        print(f"STDOUT: {e.stdout.decode()}")
        print(f"STDERR: {e.stderr.decode()}")
        return False
    except FileNotFoundError:
        print(f"FFmpeg not found. Please ensure '{FFMPEG_PATH}' is in your system PATH or provide its full path in models.py.")
        return False
    except Exception as e:
        print(f"An unexpected error occurred during FFmpeg conversion: {e}")
        return False


def transcribe_audio(audio_path):
    processor, model = load_whisper_model()
    
    converted_audio_path = audio_path.rsplit('.', 1)[0] + '_converted.wav'

    # --- Step 1: Convert the uploaded audio using FFmpeg ---
    # This block handles conversion failure. If conversion fails,
    # we don't proceed with transcription.
    if not convert_audio_ffmpeg(audio_path, converted_audio_path):
        # If FFmpeg conversion fails, the original uploaded file (`audio_path`)
        # might still exist. We should clean it up here IF it exists.
        # However, `app.py` is also responsible for this, so this is a safeguard.
        if os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except OSError as e:
                print(f"Warning: Could not remove original audio file {audio_path} after FFmpeg conversion failure in models.py: {e}")
        return "Error: Audio conversion failed."

    try:
        # --- Step 2: Load the FFmpeg-converted audio with soundfile ---
        speech, sr = sf.read(converted_audio_path)
        
        # These checks are mostly for robustness, though FFmpeg parameters should ensure it.
        if sr != 16000:
            print(f"Warning: Converted audio sample rate is {sr}Hz, expected 16000Hz. Resampling again.")
            speech = librosa.resample(speech, orig_sr=sr, target_sr=16000)
        if speech.ndim > 1:
            speech = speech[:, 0] # Take the first channel if it's still stereo

        # --- Step 3: Process and transcribe with Whisper model ---
        input_features = processor(speech, sampling_rate=16000, return_tensors="pt").input_features
        input_features = input_features.to(model.device)

        predicted_ids = model.generate(input_features)
        transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
        return transcription
    except Exception as e:
        # Catch any errors during the soundfile/librosa loading or Whisper inference
        print(f"Error during audio transcription after FFmpeg: {e}")
        return f"Error transcribing audio: {e}"
    finally:
        # --- Step 4: Clean up ONLY the FFmpeg-converted temporary audio file ---
        # The original uploaded file (`audio_path`) is handled by `app.py`.
        if os.path.exists(converted_audio_path):
            try:
                os.remove(converted_audio_path)
            except OSError as e:
                print(f"Warning: Could not remove converted audio file {converted_audio_path}: {e}")


# --- Summarization Model ---
SUMMARIZATION_MODEL_NAME = "sshleifer/distilbart-cnn-12-6"
summarizer_pipeline = None

def load_summarization_model():
    global summarizer_pipeline
    if summarizer_pipeline is None:
        print(f"Loading summarization model: {SUMMARIZATION_MODEL_NAME}...")
        summarizer_pipeline = pipeline("summarization", model=SUMMARIZATION_MODEL_NAME, tokenizer=SUMMARIZATION_MODEL_NAME)
        print("Summarization model loaded.")
    return summarizer_pipeline

def generate_summary(text):
    summarizer = load_summarization_model()
    max_chunk_length = 1000
    if len(text.split()) > max_chunk_length:
        chunks = [text[i:i+max_chunk_length*5] for i in range(0, len(text), max_chunk_length*5)]
        summaries = []
        for chunk in chunks:
            summaries.append(summarizer(chunk, max_length=150, min_length=30, do_sample=False)[0]['summary_text'])
        return " ".join(summaries)
    else:
        return summarizer(text, max_length=200, min_length=50, do_sample=False)[0]['summary_text']