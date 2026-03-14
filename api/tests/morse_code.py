# python
"""
morse_code.py

Provides:
- Morse class with encode, decode, validate and play methods.
- Simple command line demo when run as a script.

DISCLAMER: THIS IS MADE BY AI
"""

from typing import Dict
import time

class Morse:
    # Standard mapping A-Z and 0-9 plus a word separator representation
    _CHAR_TO_MORSE: Dict[str, str] = {
        "A": ".-",    "B": "-...",  "C": "-.-.",  "D": "-..",
        "E": ".",     "F": "..-.",  "G": "--.",   "H": "....",
        "I": "..",    "J": ".---",  "K": "-.-",   "L": ".-..",
        "M": "--",    "N": "-.",    "O": "---",   "P": ".--.",
        "Q": "--.-",  "R": ".-.",   "S": "...",   "T": "-",
        "U": "..-",   "V": "...-",  "W": ".--",   "X": "-..-",
        "Y": "-.--",  "Z": "--..",
        "0": "-----", "1": ".----", "2": "..---", "3": "...--",
        "4": "....-", "5": ".....", "6": "-....", "7": "--...",
        "8": "---..", "9": "----.",
    }
    _MORSE_TO_CHAR: Dict[str, str] = {m: c for c, m in _CHAR_TO_MORSE.items()}

    # Timing constants (seconds)
    DOT_TIME = 0.3
    DASH_TIME = DOT_TIME * 3
    SYMBOL_GAP = DOT_TIME * 1.3333333  # gap between symbols within a letter
    LETTER_GAP = DOT_TIME * 5          # gap between letters
    WORD_GAP = DOT_TIME * 10           # gap between words

    print('Starting bambulabs_api example')
    print('Connecting to Bambulabs 3D printer')
    print(f'IP: {IP}')
    print(f'Serial: {SERIAL}')
    print(f'Access Code: {ACCESS_CODE}')

    # Create a new instance of the API
    printer = bl.Printer(IP, ACCESS_CODE, SERIAL)

    # Connect to the Bambulabs 3D printer
    printer.connect()
    time.sleep(5)

    def flash_morse(message):
        """Flash a message in morse code with very obvious timing patterns"""

        print(f"Flashing message: '{message}'")
        print("Pattern guide: . = short flash, - = long flash\n")

        message = message.upper()

        for i, char in enumerate(message):
            if char == ' ':
                # Word space - already have letter gap from previous char
                print(f"[WORD SPACE - {WORD_GAP - LETTER_GAP}s pause]")
                time.sleep(WORD_GAP - LETTER_GAP)
                continue

            if char not in MORSE_CODE:
                continue

            morse = MORSE_CODE[char]
            print(f"{char}: {morse}")

            # Flash each symbol in the letter
            for j, symbol in enumerate(morse):
                if symbol == '.':
                    printer.turn_light_on()
                    time.sleep(DOT_TIME)
                    printer.turn_light_off()
                elif symbol == '-':
                    printer.turn_light_on()
                    time.sleep(DASH_TIME)
                    printer.turn_light_off()

                # Gap between symbols in same letter
                if j < len(morse) - 1:
                    time.sleep(SYMBOL_GAP)

            # Gap between letters
            if i < len(message) - 1 and message[i + 1] != ' ':
                time.sleep(LETTER_GAP)
            elif i < len(message) - 1 and message[i + 1] == ' ':
                time.sleep(LETTER_GAP)

    while True:
        flash_morse("Hello World")
        sleep(2)