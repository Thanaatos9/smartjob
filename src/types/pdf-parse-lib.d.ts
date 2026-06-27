// Le sous-chemin interne n'a pas de types fournis : on réutilise ceux de @types/pdf-parse.
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse";
  export default pdfParse;
}
