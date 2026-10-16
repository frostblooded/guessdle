// If an answer is chosen, it can't be chosen again for this amount of days
export const ANSWER_SKIP_PERIOD: number = 5;

export interface Pet {
  photo: string;
  name: string;
  colors: string[];
  owners: string[];
}

export const GUESS_DATA: Pet[] = [
  {
    photo: "photos/ati.jpg",
    name: "Ati",
    colors: ["Black", "Orange", "White"],
    owners: ["Niki"],
  },
  {
    photo: "photos/bela.jpg",
    name: "Bela",
    colors: ["Black", "Grey", "White"],
    owners: ["Beti"],
  },
  {
    photo: "photos/cookie.jpg",
    name: "Cookie",
    colors: ["Black", "Orange", "White"],
    owners: ["Niki"],
  },
  {
    photo: "photos/dido.jpg",
    name: "Dido",
    colors: ["Grey", "White"],
    owners: ["Beti"],
  },
  {
    photo: "photos/eddie.jpg",
    name: "Eddie",
    colors: ["Orange", "White"],
    owners: ["Stefi", "Yasen"],
  },
  {
    photo: "photos/eli.jpg",
    name: "Eli",
    colors: ["Black", "Blue", "White"],
    owners: ["Beti"],
  },
  {
    photo: "photos/ilko.jpg",
    name: "Ilko",
    colors: ["Black", "Purple", "White"],
    owners: ["Beti"],
  },
  {
    photo: "photos/jaro.jpg",
    name: "Jaro",
    colors: ["Grey"],
    owners: ["Ico"],
  },
  {
    photo: "photos/jeffy.jpg",
    name: "Jeffy",
    colors: ["Grey"],
    owners: ["Ico"],
  },
  {
    photo: "photos/kiara.jpg",
    name: "Kiara",
    colors: ["Black", "Orange", "White"],
    owners: ["Antonio", "Tanya"],
  },
  {
    photo: "photos/kimi.jpg",
    name: "Kimi",
    colors: ["Black", "Orange", "White"],
    owners: ["Bori"],
  },
  {
    photo: "photos/mochi.jpg",
    name: "Mochi",
    colors: ["Orange", "White"],
    owners: ["Petya"],
  },
  {
    photo: "photos/murlin.jpg",
    name: "Murlin",
    colors: ["Grey"],
    owners: ["Antonio", "Tanya"],
  },
  {
    photo: "photos/oreo.jpg",
    name: "Oreo",
    colors: ["Black", "White"],
    owners: ["Cveti", "Vili"],
  },
  {
    photo: "photos/patio.jpg",
    name: "Patio",
    colors: ["Green", "Yellow"],
    owners: ["Beti"],
  },
  {
    photo: "photos/pipi.jpg",
    name: "Pipi",
    colors: ["Grey", "White"],
    owners: ["Beti"],
  },
  {
    photo: "photos/puhche.jpg",
    name: "Puhche",
    colors: ["Black", "White"],
    owners: ["Cveti", "Vili"],
  },
  {
    photo: "photos/sunny.jpg",
    name: "Sunny",
    colors: ["Yellow", "Blue"],
    owners: ["Beti"],
  },
  {
    photo: "photos/todorka.jpg",
    name: "Todorka",
    colors: ["Black", "White"],
    owners: ["Didi"],
  },
];
