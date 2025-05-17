// googleApi.js
const axios = require('axios');

class GoogleSheetsService {
  constructor() {
    const key = process.env.GOOGLE_API_KEY;
    const sheetKey = process.env.SPREADSHEET_ID;
    if (!key || !sheetKey) {
      throw new Error('As variáveis GOOGLE_API_KEY e SPREADSHEET_ID devem estar definidas no .env');
    }
    this.apiKey = key;
    this.spreadsheetId = sheetKey;
    this.baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  }

  /** Retorna um array com o título de cada aba da planilha */
  async getSheetNames() {
    const url = `${this.baseUrl}/${this.spreadsheetId}` +
                `?fields=sheets.properties.title&key=${this.apiKey}`;
    const resp = await axios.get(url);
    return resp.data.sheets.map(s => s.properties.title);
  }

  /** Busca todas as linhas de uma aba, usando a primeira linha como cabeçalho */
  async fetchAll(range) {
    const url = `${this.baseUrl}/${this.spreadsheetId}/values/${encodeURIComponent(range)}` +
                `?key=${this.apiKey}`;
    try {
      const resp = await axios.get(url);
      const values = resp.data.values || [];
      if (values.length < 2) return [];
      const [headers, ...rows] = values;
      return rows.map(row => {
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = row[i] ?? '';
        });
        return obj;
      });
    } catch (err) {
      if (err.response) {
        throw new Error(
          `Google Sheets API retornou ${err.response.status}: ` +
          JSON.stringify(err.response.data)
        );
      }
      throw err;
    }
  }
}

module.exports = { GoogleSheetsService };
