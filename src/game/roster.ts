// If an answer is chosen, it can't be chosen again for this amount of days
export const ANSWER_SKIP_PERIOD: number = 5;

export interface Pet {
  // Stable slug the API and stored guesses use; never change it once shipped
  id: string;
  photo: string;
  name: string;
  colors: string[];
  owners: string[];
}

export const GUESS_DATA: Pet[] = [
  {
    id: "ati",
    photo: "photos/ati.jpg",
    name: "Ati",
    colors: ["Black", "Orange", "White"],
    owners: ["Niki"],
  },
  {
    id: "bela",
    photo: "photos/bela.jpg",
    name: "Bela",
    colors: ["Black", "Grey", "White"],
    owners: ["Beti"],
  },
  {
    id: "cookie",
    photo: "photos/cookie.jpg",
    name: "Cookie",
    colors: ["Black", "Orange", "White"],
    owners: ["Niki"],
  },
  {
    id: "dido",
    photo: "photos/dido.jpg",
    name: "Dido",
    colors: ["Grey", "White"],
    owners: ["Beti"],
  },
  {
    id: "eddie",
    photo: "photos/eddie.jpg",
    name: "Eddie",
    colors: ["Orange", "White"],
    owners: ["Stefi", "Yasen"],
  },
  {
    id: "eli",
    photo: "photos/eli.jpg",
    name: "Eli",
    colors: ["Black", "Blue", "White"],
    owners: ["Beti"],
  },
  {
    id: "ilko",
    photo: "photos/ilko.jpg",
    name: "Ilko",
    colors: ["Black", "Purple", "White"],
    owners: ["Beti"],
  },
  {
    id: "jaro",
    photo: "photos/jaro.jpg",
    name: "Jaro",
    colors: ["Grey"],
    owners: ["Ico"],
  },
  {
    id: "jeffy",
    photo: "photos/jeffy.jpg",
    name: "Jeffy",
    colors: ["Grey"],
    owners: ["Ico"],
  },
  {
    id: "kiara",
    photo: "photos/kiara.jpg",
    name: "Kiara",
    colors: ["Black", "Orange", "White"],
    owners: ["Antonio", "Tanya"],
  },
  {
    id: "kimi",
    photo: "photos/kimi.jpg",
    name: "Kimi",
    colors: ["Black", "Orange", "White"],
    owners: ["Bori"],
  },
  {
    id: "mochi",
    photo: "photos/mochi.jpg",
    name: "Mochi",
    colors: ["Orange", "White"],
    owners: ["Petya"],
  },
  {
    id: "murlin",
    photo: "photos/murlin.jpg",
    name: "Murlin",
    colors: ["Grey"],
    owners: ["Antonio", "Tanya"],
  },
  {
    id: "oreo",
    photo: "photos/oreo.jpg",
    name: "Oreo",
    colors: ["Black", "White"],
    owners: ["Cveti", "Vili"],
  },
  {
    id: "patio",
    photo: "photos/patio.jpg",
    name: "Patio",
    colors: ["Green", "Yellow"],
    owners: ["Beti"],
  },
  {
    id: "pipi",
    photo: "photos/pipi.jpg",
    name: "Pipi",
    colors: ["Grey", "White"],
    owners: ["Beti"],
  },
  {
    id: "puhche",
    photo: "photos/puhche.jpg",
    name: "Puhche",
    colors: ["Black", "White"],
    owners: ["Cveti", "Vili"],
  },
  {
    id: "sunny",
    photo: "photos/sunny.jpg",
    name: "Sunny",
    colors: ["Yellow", "Blue"],
    owners: ["Beti"],
  },
  {
    id: "todorka",
    photo: "photos/todorka.jpg",
    name: "Todorka",
    colors: ["Black", "White"],
    owners: ["Didi"],
  },
];
