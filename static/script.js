// static/script.js

document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const journalDateInput = document.getElementById('journalDate');
    const journalEntryTextarea = document.getElementById('journalEntry');
    const speakToTypeBtn = document.getElementById('speakToTypeBtn');
    const imageUploadInput = document.getElementById('imageUpload');
    const uploadImageBtn = document.getElementById('uploadImageBtn');
    const saveEntryBtn = document.getElementById('saveEntryBtn');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer'); // For journal images

    const fromDateInput = document.getElementById('fromDate');
    const toDateInput = document.getElementById('toDate');
    const generateStoryBtn = document.getElementById('generateStoryBtn');
    const generatedStoryTextarea = document.getElementById('generatedStory');
    const copyStoryBtn = document.getElementById('copyStoryBtn');
    const saveNarrativeBtn = document.getElementById('saveNarrativeBtn');
    const shareStoryBtn = document.getElementById('shareStoryBtn');
    const storyImagePreviewContainer = document.getElementById('storyImagePreviewContainer'); // For story images

    const statusMessageDiv = document.getElementById('statusMessage');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingMessage = document.getElementById('loadingMessage');

    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxClose = document.querySelector('.lightbox-close');
    const lightboxPrev = document.querySelector('.lightbox-nav.lightbox-prev');
    const lightboxNext = document.querySelector('.lightbox-nav.lightbox-next');

    // UI elements for Journal Timeline & About Section & Dashboard
    const aboutToggle = document.querySelector('.about-toggle');
    const aboutContent = document.querySelector('.about-content');
    const journalTimeline = document.getElementById('journalTimeline');

    const totalEntriesSpan = document.getElementById('totalEntries');
    const totalWordsSpan = document.getElementById('totalWords');
    const mostActiveMonthSpan = document.getElementById('mostActiveMonth');
    const entriesPerMonthChart = document.getElementById('entriesPerMonthChart');

    const scrollToTopBtn = document.getElementById('scrollToTopBtn');

    // NEW UI elements
    const themeToggle = document.getElementById('themeToggle');
    const clearEntryBtn = document.getElementById('clearEntryBtn');
    const timelineSearchInput = document.getElementById('timelineSearch');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const downloadAllEntriesBtn = document.getElementById('downloadAllEntriesBtn');
    const memoryPromptText = document.getElementById('memoryPromptText');
    const newPromptBtn = document.getElementById('newPromptBtn');

    let uploadedImageFiles = []; // Stores File objects for images currently selected for a journal entry
    let existingImagePaths = []; // Stores paths for images already saved with an entry
    let currentStoryImages = []; // Stores image URLs for the current generated story
    let currentImageIndex = 0; // For lightbox navigation
    let allJournalEntries = []; // To store all entries for client-side filtering/download

    const memoryPrompts = [
        "What was a moment today that made you smile or laugh?",
        "Describe a challenge you faced recently and how you overcame it (or are trying to).",
        "What is one small thing you're grateful for today?",
        "If you could give advice to your past self, what would it be?",
        "What new thing did you learn today, no matter how small?",
        "Describe a dream you had recently.",
        "What are your hopes or plans for tomorrow?",
        "Recall a favorite memory from your childhood.",
        "What's a song that resonates with you today, and why?",
        "If your day were a color, what color would it be and why?",
        "What is something you've been putting off? How do you feel about it?",
        "Describe a person who has positively impacted your life recently."
    ];

    // --- Flatpickr Initialization ---
    const journalDatePicker = flatpickr(journalDateInput, {
        dateFormat: "Y-m-d",
        defaultDate: "today",
        onChange: function(selectedDates, dateStr, instance) {
            if (selectedDates.length > 0) {
                loadJournalEntry(dateStr);
            }
        }
    });

    flatpickr(fromDateInput, {
        dateFormat: "Y-m-d",
    });

    flatpickr(toDateInput, {
        dateFormat: "Y-m-d",
    });

    // --- Utility Functions ---

    // Show/Hide Loading Overlay
    function showLoading(message = 'Processing...') {
        loadingMessage.textContent = message;
        loadingOverlay.classList.add('show');
    }

    function hideLoading() {
        loadingOverlay.classList.remove('show');
    }

    // Show Status Messages
    function showStatusMessage(message, isError = false) {
        statusMessageDiv.textContent = message;
        statusMessageDiv.classList.remove('error');
        if (isError) {
            statusMessageDiv.classList.add('error');
        }
        statusMessageDiv.classList.add('show');
        setTimeout(() => {
            statusMessageDiv.classList.remove('show');
        }, 3000); // Message disappears after 3 seconds
    }

    // --- Theme Toggle ---
    function applyTheme(theme) {
        document.body.classList.remove('light-mode', 'dark-mode');
        document.body.classList.add(theme);
        localStorage.setItem('theme', theme);

        const icon = theme === 'dark-mode' ? 'fas fa-sun' : 'fas fa-moon';
        themeToggle.innerHTML = `<i class="${icon}"></i>`;
    }

    function toggleTheme() {
        const currentTheme = localStorage.getItem('theme') || 'light-mode';
        const newTheme = currentTheme === 'light-mode' ? 'dark-mode' : 'light-mode';
        applyTheme(newTheme);
    }

    themeToggle.addEventListener('click', toggleTheme);

    // Apply saved theme on load
    const savedTheme = localStorage.getItem('theme') || 'light-mode';
    applyTheme(savedTheme);


    // --- Journal Entry Section ---

    // Load entry for selected date
    async function loadJournalEntry(date) {
        showLoading('Loading entry...');
        try {
            const response = await fetch(`/get_entry/${date}`);
            const data = await response.json();
            if (data.success) {
                journalEntryTextarea.value = data.content || '';
                existingImagePaths = data.image_paths || []; // Update existing paths
                uploadedImageFiles = []; // Clear new uploads when loading a new entry
                renderImagePreviews(existingImagePaths, imagePreviewContainer, true); // True for journal previews
            } else {
                journalEntryTextarea.value = '';
                existingImagePaths = [];
                uploadedImageFiles = [];
                renderImagePreviews([], imagePreviewContainer, true); // Clear previews if no entry
            }
            hideLoading();
            // Refresh timeline and dashboard after loading an entry
            fetchAllEntries(); // This updates allJournalEntries
            fetchDashboardStats();
        } catch (error) {
            console.error('Error loading journal entry:', error);
            showStatusMessage('Error loading journal entry.', true);
            journalEntryTextarea.value = '';
            existingImagePaths = [];
            uploadedImageFiles = [];
            renderImagePreviews([], imagePreviewContainer, true);
            hideLoading();
        }
    }

    // Render image previews (can be used for journal or story)
    function renderImagePreviews(paths, containerElement, isJournal = false) {
        containerElement.innerHTML = ''; // Clear existing previews

        paths.forEach(path => {
            if (path) {
                const imgContainer = document.createElement('div');
                imgContainer.className = 'image-preview';
                imgContainer.dataset.filepath = path; // Store original path

                const img = document.createElement('img');
                img.src = path;
                img.alt = 'Uploaded Image';
                imgContainer.appendChild(img);

                if (isJournal) { // Only add remove button for journal entries
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'remove-image-btn';
                    removeBtn.innerHTML = '&times;'; // 'x' icon
                    removeBtn.onclick = (event) => {
                        event.stopPropagation(); // Prevent opening lightbox if present
                        removeImagePreview(imgContainer, path);
                    };
                    imgContainer.appendChild(removeBtn);
                } else {
                    // Add click listener for lightbox if it's a story image
                    imgContainer.addEventListener('click', () => openLightbox(path));
                }
                containerElement.appendChild(imgContainer);
            }
        });

        // For journal, also render newly selected images (from `uploadedImageFiles`)
        if (isJournal) {
            uploadedImageFiles.forEach((file, index) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const imgContainer = document.createElement('div');
                    imgContainer.className = 'image-preview';
                    imgContainer.dataset.fileindex = index; // Store index for removal

                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.alt = 'Selected Image';
                    imgContainer.appendChild(img);

                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'remove-image-btn';
                    removeBtn.innerHTML = '&times;';
                    removeBtn.onclick = (event) => {
                        event.stopPropagation();
                        removeImagePreview(imgContainer, null, index);
                    };
                    imgContainer.appendChild(removeBtn);

                    containerElement.appendChild(imgContainer);
                };
                reader.readAsDataURL(file);
            });
        }
    }

    // Remove image preview from journal
    function removeImagePreview(container, pathToRemove, indexToRemove) {
        if (pathToRemove) {
            // Remove from existingImagePaths
            existingImagePaths = existingImagePaths.filter(p => p !== pathToRemove);
        } else if (indexToRemove !== null && indexToRemove !== undefined) {
            // Remove from uploadedImageFiles based on index
            uploadedImageFiles.splice(indexToRemove, 1);
        }
        container.remove();
    }


    // Save Journal Entry
    saveEntryBtn.addEventListener('click', async () => {
        const date = journalDateInput.value;
        const content = journalEntryTextarea.value;

        if (!date) {
            showStatusMessage('Please select a date.', true);
            return;
        }

        showLoading('Saving entry...');

        const formData = new FormData();
        formData.append('date', date);
        formData.append('content', content);

        // Upload new images first
        const uploadedPaths = [];
        for (const file of uploadedImageFiles) {
            const imageFormData = new FormData();
            imageFormData.append('file', file);
            try {
                const uploadResponse = await fetch('/upload_image', {
                    method: 'POST',
                    body: imageFormData
                });
                const uploadData = await uploadResponse.json();
                if (uploadData.success) {
                    uploadedPaths.push(uploadData.filepath);
                } else {
                    console.error('Image upload failed:', uploadData.message);
                    showStatusMessage(`Failed to upload image: ${uploadData.message}`, true);
                    hideLoading();
                    return; // Stop saving if image upload fails
                }
            } catch (error) {
                console.error('Error uploading image:', error);
                showStatusMessage('Error uploading image.', true);
                hideLoading();
                return;
            }
        }

        // Combine existing and newly uploaded image paths
        const allImagePaths = [...existingImagePaths, ...uploadedPaths].filter(Boolean); // Filter out empty strings/nulls
        formData.append('image_paths', allImagePaths.join(','));

        try {
            const response = await fetch('/save_entry', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                showStatusMessage('Entry saved successfully!');
                // Reload entry to reflect saved state and clear new uploads
                await loadJournalEntry(date); // Await this to ensure timeline & dashboard are updated after save
            } else {
                showStatusMessage(`Error: ${data.message}`, true);
            }
            hideLoading();
        } catch (error) {
            console.error('Error saving entry:', error);
            showStatusMessage('Error saving entry.', true);
            hideLoading();
        }
    });

    // Image Upload (Journal)
    uploadImageBtn.addEventListener('click', () => {
        imageUploadInput.click(); // Trigger the hidden file input
    });

    imageUploadInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files);
        uploadedImageFiles = [...uploadedImageFiles, ...files]; // Add new files to existing ones
        renderImagePreviews(existingImagePaths, imagePreviewContainer, true); // Re-render to show new and existing
    });

    // Clear Entry Functionality (New)
    clearEntryBtn.addEventListener('click', () => {
        journalEntryTextarea.value = '';
        uploadedImageFiles = [];
        existingImagePaths = [];
        renderImagePreviews([], imagePreviewContainer, true);
        showStatusMessage('Journal entry cleared!');
    });


    // Voice-to-Text Transcription
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;

    speakToTypeBtn.addEventListener('click', async () => {
        if (!isRecording) {
            // Start recording
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                
                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };
                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    audioChunks = []; // Clear chunks for next recording

                    showLoading('Transcribing audio...'); // Show loading for transcription
                    // Remove recording active class immediately when recording stops
                    speakToTypeBtn.classList.remove('recording-active');

                    const formData = new FormData();
                    formData.append('audio_file', audioBlob, 'recording.webm');

                    try {
                        const response = await fetch('/transcribe_audio', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await response.json();
                        if (data.success) {
                            journalEntryTextarea.value += (journalEntryTextarea.value ? '\n' : '') + data.transcription;
                            showStatusMessage('Transcription successful!');
                        } else {
                            showStatusMessage(`Transcription failed: ${data.message}`, true);
                        }
                        hideLoading(); // Hide loading after transcription
                    } catch (error) {
                        console.error('Error transcribing audio:', error);
                        showStatusMessage('Error during transcription.', true);
                        hideLoading(); // Hide loading on error
                    }
                };

                mediaRecorder.start();
                speakToTypeBtn.textContent = 'Stop Recording';
                speakToTypeBtn.classList.add('recording-active'); // Add class for visual indicator
                // Add specific class for the button when recording, not just general 'recording-active'
                speakToTypeBtn.classList.add('speak-to-type-button'); // Add a unique class for CSS
                isRecording = true;
                showStatusMessage('Recording started...');
            } catch (error) {
                console.error('Error accessing microphone:', error);
                showStatusMessage('Please grant microphone access.', true);
            }
        } else {
            // Stop recording
            mediaRecorder.stop();
            speakToTypeBtn.textContent = 'Speak to Type';
            speakToTypeBtn.classList.remove('recording-active'); // Remove class for visual indicator
            speakToTypeBtn.classList.remove('speak-to-type-button'); // Remove unique class
            isRecording = false;
            showStatusMessage('Recording stopped. Processing...');
        }
    });

    // --- Story Generation Section ---

    generateStoryBtn.addEventListener('click', async () => {
        const fromDate = fromDateInput.value;
        const toDate = toDateInput.value;

        if (!fromDate || !toDate) {
            showStatusMessage('Please select both From and To dates.', true);
            return;
        }

        if (new Date(fromDate) > new Date(toDate)) {
            showStatusMessage('From Date cannot be after To Date.', true);
            return;
        }

        showLoading('Generating your life story...'); // Show loading for story generation
        generatedStoryTextarea.value = 'Generating... Please wait.';
        storyImagePreviewContainer.innerHTML = ''; // Clear previous images

        try {
            const response = await fetch('/generate_story', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fromDate, toDate })
            });
            const data = await response.json();
            if (data.success) {
                generatedStoryTextarea.value = data.story;
                showStatusMessage('Story generated successfully!');
                currentStoryImages = data.image_urls || []; // Store images for lightbox
                renderImagePreviews(currentStoryImages, storyImagePreviewContainer, false); // False for story previews
            } else {
                generatedStoryTextarea.value = `Error generating story: ${data.message}`;
                showStatusMessage(`Error: ${data.message}`, true);
            }
            hideLoading(); // Hide loading after story generation
        } catch (error) {
            console.error('Error generating story:', error);
            generatedStoryTextarea.value = 'An error occurred while generating the story.';
            showStatusMessage('Error generating story.', true);
            hideLoading(); // Hide loading on error
        }
    });

    // --- Story Actions ---
    copyStoryBtn.addEventListener('click', () => {
        generatedStoryTextarea.select();
        generatedStoryTextarea.setSelectionRange(0, 99999); // For mobile devices
        document.execCommand('copy');
        showStatusMessage('Story copied to clipboard!');
    });

    saveNarrativeBtn.addEventListener('click', () => {
        const storyContent = generatedStoryTextarea.value;
        if (storyContent) {
            const blob = new Blob([storyContent], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `LifeStory_${fromDateInput.value}_to_${toDateInput.value}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            showStatusMessage('Story downloaded!');
        } else {
            showStatusMessage('No story to download.', true);
        }
    });

    shareStoryBtn.addEventListener('click', () => {
        const storyContent = generatedStoryTextarea.value;
        if (storyContent && navigator.share) {
            navigator.share({
                title: 'My Life Story',
                text: storyContent,
            })
            .then(() => showStatusMessage('Story shared successfully!'))
            .catch((error) => console.error('Error sharing:', error));
        } else {
            showStatusMessage('Web Share API not supported or no story to share.', true);
            // Replace alert with a custom message box if needed, but for now, keep as a fallback
            // In a real application, you'd show a custom modal.
            // alert("Sharing not supported in your browser. You can copy the text manually.");
            showStatusMessage("Sharing not supported in your browser. Copy text manually.", true);
        }
    });

    // --- Lightbox Functions ---
    function openLightbox(imageSrc) {
        lightbox.classList.add('show');
        lightboxImage.src = imageSrc;
        currentImageIndex = currentStoryImages.indexOf(imageSrc);
    }

    function closeLightbox() {
        lightbox.classList.remove('show');
        lightboxImage.src = '';
        currentImageIndex = 0;
    }

    function navigateLightbox(direction) {
        currentImageIndex += direction;
        if (currentImageIndex < 0) {
            currentImageIndex = currentStoryImages.length - 1;
        } else if (currentImageIndex >= currentStoryImages.length) {
            currentImageIndex = 0;
        }
        lightboxImage.src = currentStoryImages[currentImageIndex];
    }

    // Lightbox Event Listeners
    lightboxClose.addEventListener('click', closeLightbox);
    lightboxPrev.addEventListener('click', () => navigateLightbox(-1));
    lightboxNext.addEventListener('click', () => navigateLightbox(1));
    // Close lightbox if clicked outside the image
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
    // Keyboard navigation for lightbox
    document.addEventListener('keydown', (e) => {
        if (lightbox.classList.contains('show')) {
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') navigateLightbox(-1);
            if (e.key === 'ArrowRight') navigateLightbox(1);
        }
    });

    // --- About Section Toggle ---
    aboutToggle.addEventListener('click', () => {
        aboutContent.classList.toggle('expanded');
        aboutToggle.classList.toggle('expanded');
    });

    // --- Journal Timeline Functions ---
    async function fetchAllEntries() {
        showLoading('Loading timeline...');
        try {
            const response = await fetch('/get_all_entries');
            const data = await response.json();
            if (data.success) {
                allJournalEntries = data.entries; // Store all entries
                renderTimeline(allJournalEntries); // Render initial unfiltered timeline
            } else {
                journalTimeline.innerHTML = '<p class="no-entries-message error-message">Error loading timeline. Please refresh.</p>';
            }
            hideLoading();
        } catch (error) {
            console.error('Error fetching all entries:', error);
            journalTimeline.innerHTML = '<p class="no-entries-message error-message">Error loading timeline. Please refresh.</p>';
            hideLoading();
        }
    }

    function renderTimeline(entriesToRender) {
        journalTimeline.innerHTML = ''; // Clear existing
        if (entriesToRender.length > 0) {
            entriesToRender.forEach(entry => {
                const item = document.createElement('div');
                item.className = 'journal-timeline-item';
                item.dataset.date = entry.date;
                item.innerHTML = `
                    <div class="item-date">${entry.date}</div>
                    <div class="item-snippet">${entry.snippet}</div>
                    <div class="item-meta">${entry.image_count} image(s)</div>
                `;
                item.addEventListener('click', () => {
                    journalDatePicker.setDate(entry.date); // Select date in calendar
                    loadJournalEntry(entry.date); // Load entry into journal section
                    document.getElementById('journal-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
                journalTimeline.appendChild(item);
            });
        } else {
            journalTimeline.innerHTML = '<p class="no-entries-message">No matching entries found.</p>';
        }
    }

    // Timeline Search/Filter (New)
    timelineSearchInput.addEventListener('input', () => {
        filterTimelineEntries();
    });

    clearSearchBtn.addEventListener('click', () => {
        timelineSearchInput.value = '';
        filterTimelineEntries();
    });

    function filterTimelineEntries() {
        const searchTerm = timelineSearchInput.value.toLowerCase();
        const filteredEntries = allJournalEntries.filter(entry =>
            entry.content.toLowerCase().includes(searchTerm) ||
            entry.date.includes(searchTerm)
        );
        renderTimeline(filteredEntries);
    }

    // Download All Entries (New)
    downloadAllEntriesBtn.addEventListener('click', () => {
        if (allJournalEntries.length === 0) {
            showStatusMessage('No entries to download.', true);
            return;
        }

        const formattedEntries = allJournalEntries.map(entry =>
            `Date: ${entry.date}\nContent:\n${entry.content}\nImages: ${entry.image_paths.join(', ')}\n---\n`
        ).join('\n');

        const blob = new Blob([formattedEntries], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'LifeStory_All_Entries.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showStatusMessage('All entries downloaded!');
    });


    // --- Dashboard Functions ---
    async function fetchDashboardStats() {
        showLoading('Loading insights...');
        try {
            const response = await fetch('/get_dashboard_stats');
            const data = await response.json();
            if (data.success) {
                totalEntriesSpan.textContent = data.total_entries;
                totalWordsSpan.textContent = data.total_characters_written;
                mostActiveMonthSpan.textContent = data.most_active_month || '-';

                // Render Entries per Month chart
                entriesPerMonthChart.innerHTML = ''; // Clear previous chart
                if (data.entries_per_month && data.entries_per_month.length > 0) {
                    const maxCount = Math.max(...data.entries_per_month.map(item => item.count));

                    data.entries_per_month.forEach(item => {
                        const barItem = document.createElement('div');
                        barItem.className = 'month-bar-item';
                        barItem.innerHTML = `
                            <span class="month-label">${item.month}</span>
                            <div class="month-bar-wrapper">
                                <div class="month-bar" style="width: ${((item.count / maxCount) * 100).toFixed(1)}%;">
                                    <span class="month-bar-count">${item.count}</span>
                                </div>
                            </div>
                        `;
                        entriesPerMonthChart.appendChild(barItem);
                    });
                } else {
                    entriesPerMonthChart.innerHTML = '<p class="no-data-message">No data to display.</p>';
                }
            } else {
                showStatusMessage(`Error fetching dashboard: ${data.message}`, true);
                entriesPerMonthChart.innerHTML = '<p class="no-data-message error-message">Error loading chart.</p>';
            }
            hideLoading();
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            showStatusMessage('Error loading dashboard stats.', true);
            entriesPerMonthChart.innerHTML = '<p class="no-data-message error-message">Error loading chart.</p>';
            hideLoading();
        }
    }


    // --- Scroll to Top Button ---
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) { // Show button after scrolling 300px
            scrollToTopBtn.classList.add('show');
        } else {
            scrollToTopBtn.classList.remove('show');
        }
    });

    scrollToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth' // Smooth scroll
        });
    });

    // --- Memory Prompt (New) ---
    function displayRandomPrompt() {
        const randomIndex = Math.floor(Math.random() * memoryPrompts.length);
        memoryPromptText.textContent = memoryPrompts[randomIndex];
    }

    newPromptBtn.addEventListener('click', displayRandomPrompt);


    // --- Initial Load ---
    // Load today's entry on initial page load (robust check for date selection)
    // and also fetch all entries for the timeline and dashboard.
    const initialDate = journalDatePicker.selectedDates[0]?.toISOString().split('T')[0];
    if (initialDate) {
        loadJournalEntry(initialDate); // This also calls fetchAllEntries() and fetchDashboardStats() upon completion
    } else {
        // Fallback if no date is initially selected (e.g., if defaultDate fails)
        loadJournalEntry(new Date().toISOString().split('T')[0]);
    }

    // Display initial memory prompt
    displayRandomPrompt();
});
