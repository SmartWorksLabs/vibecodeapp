// Simple interactivity for the example project

document.addEventListener('DOMContentLoaded', function() {
    const buttons = document.querySelectorAll('button');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            alert('Button clicked! You can edit this behavior in the code editor.');
        });
    });
    
    console.log('VibeCanvas example project loaded!');
});

