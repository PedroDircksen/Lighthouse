const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

class Client {
    constructor(phone, epic_id) {
        this.id = uuidv4(); 
        this.jwt = jwt.sign({epic_id: epic_id}, process.env.SECRET_KEY);      
        this.phone = phone; 
    }

    formatDataToInsert(){
        return {
            id: this.id,
            jwt: this.jwt,
            phone: this.phone
        }
    }
}

module.exports = Client;