# Armazém 3D · da curva ABC ao endereçamento

Ferramenta da disciplina **Logística 2**: a turma classifica os SKUs pela curva ABC (valor e giro) numa planilha e,
no fim, importa o arquivo aqui para ver como o armazém fica com o endereçamento **antes** e **depois** da classificação.

## Como usar
1. Clique em **Baixar planilha da aula (.xlsx)** e siga a aba **Roteiro**.
2. Classifique os SKUs nas abas `ABC_Valor` e `ABC_Giro` e leve as classes para a aba `Base`.
3. Clique em **Importar planilha**, escolha o arquivo e compare **Antes × Depois**.

Tudo roda no seu navegador: a planilha importada **não é enviada a nenhum servidor** e nada fica salvo online.
Guarde o seu `.xlsx`: se fechar a aba, a simulação é perdida.

## Arquivos
- `index.html`, `abc.js`, `armazem.js`, `dados.js`: a aplicação.
- `Planilha_Armazem3D.xlsx`: planilha da aula (151 SKUs, sem classificação ABC).
- `lib/`: Three.js e SheetJS (veja `lib/LICENSES.txt`).
