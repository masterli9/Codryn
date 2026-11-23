import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const answer = Math.floor(Math.random() * 100) + 1;
const readline = createInterface({ input, output });
let attempts = 0;

console.log('Hádání čísla: myslím si číslo od 1 do 100.');
console.log('Zadej číslo, nebo napiš konec.');

try {
  while (true) {
    const guessText = (await readline.question('Tvůj tip: ')).trim();
    if (guessText.toLowerCase() === 'konec') {
      console.log('Hra ukončena.');
      break;
    }

    const guess = Number(guessText);
    if (!/^\d+$/.test(guessText) || !Number.isInteger(guess) || guess < 1 || guess > 100) {
      console.log('Zadej celé číslo od 1 do 100.');
      continue;
    }

    attempts += 1;
    if (guess === answer) {
      console.log(`Správně! Uhodl jsi číslo ${answer} na ${attempts}. pokus.`);
      break;
    }
    console.log(guess < answer ? 'Hledané číslo je větší.' : 'Hledané číslo je menší.');
  }
} finally {
  readline.close();
}
