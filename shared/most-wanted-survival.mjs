export function mostWantedIntroText(elapsed) {
  return elapsed<3000?'YOU ARE MOST WANTED!':elapsed<6000?'Dallas Hunters are coming for you!':elapsed<9000?'Two dangerous aircraft are tracking you!':'SURVIVE FOR 2 MINUTES!';
}
