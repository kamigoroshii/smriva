# app.py
from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for
from werkzeug.utils import secure_filename
import os
import datetime
# NEW: Import func for database aggregate functions
from sqlalchemy import func

# Import database and model functions from your local files
from database import init_db, db, JournalEntry
from models import transcribe_audio, generate_summary, load_whisper_model, load_summarization_model

app = Flask(__name__)

# Configure upload folder for images and temporary audio files
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Initialize the database and pre-load AI models when the app starts
# This ensures models are ready in memory and avoids delays on first request.
with app.app_context():
    init_db(app) # Initializes SQLAlchemy and creates tables if they don't exist
    print("Pre-loading AI models...")
    load_whisper_model() # Load Whisper ASR model
    load_summarization_model() # Load text summarization model
    print("AI models pre-loaded.")

@app.route('/')
def intro():
    """
    Renders the introductory page of the application.
    """
    return render_template('intro.html')

@app.route('/main_app')
def index():
    """
    Renders the main application page (journal and story sections).
    """
    return render_template('index.html')

@app.route('/save_entry', methods=['POST'])
def save_entry():
    """
    API endpoint to save or update a journal entry.
    Expects 'date', 'content', and 'image_paths' (comma-separated string) from the frontend.
    """
    date = request.form.get('date')
    content = request.form.get('content')
    image_paths_str = request.form.get('image_paths', '') # Get comma-separated paths, default to empty string

    if not date:
        return jsonify({'success': False, 'message': 'Date is required.'}), 400

    # Try to find an existing entry for the given date
    entry = JournalEntry.query.filter_by(date=date).first()

    if entry:
        # If entry exists, update its content and image paths
        entry.content = content
        entry.image_paths = image_paths_str
    else:
        # If no entry exists, create a new one
        entry = JournalEntry(date=date, content=content, image_paths=image_paths_str)
        db.session.add(entry) # Add the new entry to the session

    try:
        db.session.commit() # Commit the changes to the database
        return jsonify({'success': True, 'message': 'Entry saved successfully.'})
    except Exception as e:
        db.session.rollback() # Rollback in case of an error
        print(f"Error saving entry to DB: {e}")
        return jsonify({'success': False, 'message': f'Error saving entry: {e}'}), 500

@app.route('/get_entry/<date>', methods=['GET'])
def get_entry(date):
    """
    API endpoint to retrieve a journal entry for a specific date.
    Returns the content and a list of image paths for that date.
    """
    entry = JournalEntry.query.filter_by(date=date).first()
    if entry:
        # Split the comma-separated image paths string into a list
        image_paths_list = entry.image_paths.split(',') if entry.image_paths else []
        return jsonify({
            'success': True,
            'content': entry.content,
            'image_paths': [path.strip() for path in image_paths_list if path.strip()] # Clean and filter empty paths
        })
    # If no entry found for the date, return empty content and image list
    return jsonify({'success': False, 'content': '', 'image_paths': []})

@app.route('/get_all_entries', methods=['GET'])
def get_all_entries():
    """
    API endpoint to retrieve a summary of all journal entries, ordered by date.
    Returns date, a content snippet, and image count.
    """
    entries = JournalEntry.query.order_by(JournalEntry.date.desc()).all() # Order by descending date (most recent first)
    entries_data = []
    for entry in entries:
        # Take a snippet of the content for display in the timeline
        snippet = entry.content[:100] + '...' if entry.content and len(entry.content) > 100 else entry.content or 'No text content.'
        # Count images
        image_count = len(entry.image_paths.split(',')) if entry.image_paths else 0
        entries_data.append({
            'date': entry.date,
            'snippet': snippet,
            'image_count': image_count
        })
    return jsonify({'success': True, 'entries': entries_data})

@app.route('/get_dashboard_stats', methods=['GET'])
def get_dashboard_stats():
    """
    NEW API endpoint to retrieve various dashboard statistics.
    Calculates total entries, total characters written, and entries per month.
    """
    try:
        # Total Entries
        total_entries = db.session.query(func.count(JournalEntry.id)).scalar() or 0

        # Total Characters Written (approximate words, summing length of content)
        # Using coalesce to treat NULL content as 0 length
        total_characters_written = db.session.query(func.sum(func.length(JournalEntry.content))).filter(JournalEntry.content.isnot(None)).scalar() or 0

        # Entries per Month (using SQLite strftime for YYYY-MM grouping)
        # Ordering by month for consistent display on frontend
        entries_per_month_raw = db.session.query(
            func.strftime('%Y-%m', JournalEntry.date),
            func.count(JournalEntry.id)
        ).group_by(func.strftime('%Y-%m', JournalEntry.date)).order_by(func.strftime('%Y-%m', JournalEntry.date)).all()

        entries_per_month = []
        most_active_month = {'month': '-', 'count': 0}
        for month, count in entries_per_month_raw:
            entries_per_month.append({'month': month, 'count': count})
            if count > most_active_month['count']:
                most_active_month['month'] = month
                most_active_month['count'] = count

        return jsonify({
            'success': True,
            'total_entries': total_entries,
            'total_characters_written': total_characters_written,
            'entries_per_month': entries_per_month,
            'most_active_month': most_active_month['month']
        })
    except Exception as e:
        print(f"Error fetching dashboard stats: {e}")
        return jsonify({'success': False, 'message': f'Error fetching dashboard stats: {e}'}), 500


@app.route('/upload_image', methods=['POST'])
def upload_image():
    """
    API endpoint to handle image uploads.
    Saves the image to the UPLOAD_FOLDER and returns its public path.
    """
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file'}), 400
    if file:
        # Secure the filename to prevent directory traversal attacks
        filename = secure_filename(file.filename)
        # Create a unique filename to prevent overwriting existing files
        unique_filename = f"{datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(filepath) # Save the file to the determined path
        # Return the URL where the image can be accessed
        return jsonify({'success': True, 'filepath': f'/uploads/{unique_filename}'})
    return jsonify({'success': False, 'message': 'Unknown error during upload'}), 500

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    """
    Serves uploaded files from the UPLOAD_FOLDER.
    This allows images saved by the backend to be displayed in the frontend.
    """
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/transcribe_audio', methods=['POST'])
def transcribe_audio_api():
    """
    API endpoint to transcribe audio to text using the Whisper ASR model.
    Expects an 'audio_file' from the frontend.
    """
    if 'audio_file' not in request.files:
        return jsonify({'success': False, 'message': 'No audio file part'}), 400
    audio_file = request.files['audio_file']
    if audio_file.filename == '':
        return jsonify({'success': False, 'message': 'No selected audio file'}), 400
    if audio_file:
        audio_filename = secure_filename(audio_file.filename)
        # Save the uploaded file temporarily
        audio_filepath = os.path.join(app.config['UPLOAD_FOLDER'], audio_filename)
        audio_file.save(audio_filepath)

        try:
            # Call the transcription function from models.py
            transcribed_text = transcribe_audio(audio_filepath)
            # IMPORTANT: app.py is responsible for deleting the *original* uploaded file.
            # models.py will handle the cleanup of the *converted* temporary file.
            if os.path.exists(audio_filepath): # Add check for robustness
                os.remove(audio_filepath)
            return jsonify({'success': True, 'transcription': transcribed_text})
        except Exception as e:
            print(f"Error during audio transcription API call: {e}")
            # Ensure cleanup of original file if an error occurs during transcription process
            if os.path.exists(audio_filepath):
                try:
                    os.remove(audio_filepath)
                except OSError as err:
                    print(f"Warning: Could not remove original audio file {audio_filepath} after transcription error: {err}")
            return jsonify({'success': False, 'message': f'Error transcribing audio: {e}'}), 500
    return jsonify({'success': False, 'message': 'Unknown error during audio transcription'}), 500

@app.route('/generate_story', methods=['POST'])
def generate_story():
    """
    API endpoint to generate a life story summary based on journal entries
    within a specified date range. Uses the text summarization model.
    Expects 'fromDate' and 'toDate' in the request JSON body.
    """
    from_date_str = request.json.get('fromDate')
    to_date_str = request.json.get('toDate')

    if not from_date_str or not to_date_str:
        return jsonify({'success': False, 'message': 'Both From and To dates are required.'}), 400

    # Fetch entries within the date range, ordered by date
    entries = JournalEntry.query.filter(
        JournalEntry.date >= from_date_str,
        JournalEntry.date <= to_date_str
    ).order_by(JournalEntry.date).all()

    if not entries:
        return jsonify({'success': True, 'story': 'No entries found for the selected date range.', 'image_urls': []})

    full_text = []
    image_urls = set() # Use a set to store unique image URLs from all entries in the range

    for entry in entries:
        if entry.content:
            full_text.append(f"On {entry.date}: {entry.content}")
        if entry.image_paths:
            # Add all image paths from the entry to the set
            for path in entry.image_paths.split(','):
                if path.strip(): # Ensure path is not empty
                    image_urls.add(path.strip())

    combined_text = "\n\n".join(full_text)

    if not combined_text:
        # If no textual content, but there are images, indicate that
        if image_urls:
            return jsonify({
                'success': True,
                'story': 'No textual entries, but here are images from this period.',
                'image_urls': list(image_urls) # Convert set to list for JSON serialization
            })
        else:
            return jsonify({'success': True, 'story': 'No entries found for the selected date range.', 'image_urls': []})


    try:
        # Generate summary using the function from models.py
        summary = generate_summary(combined_text)
        return jsonify({'success': True, 'story': summary, 'image_urls': list(image_urls)})
    except Exception as e:
        print(f"Error generating summary API call: {e}")
        return jsonify({'success': False, 'message': f'Error generating story: {e}'}), 500

if __name__ == '__main__':
    app.run(debug=True)
