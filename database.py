# database.py
from flask_sqlalchemy import SQLAlchemy
from flask import Flask
import os

db = SQLAlchemy()

class JournalEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.String(10), nullable=False) # Format: YYYY-MM-DD
    content = db.Column(db.Text, nullable=True)
    image_paths = db.Column(db.Text, nullable=True) # Comma-separated paths

    def __repr__(self):
        return f'<JournalEntry {self.date}>'

# THIS IS THE FUNCTION YOUR app.py IS LOOKING FOR:
def init_db(app):
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///lifestory.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    with app.app_context():
        db.create_all() # This creates the tables if they don't exist
    print("Database initialized and tables created.")

def get_db_path():
    return os.path.join(os.getcwd(), 'lifestory.db')