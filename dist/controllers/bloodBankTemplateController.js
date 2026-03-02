"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadDonorTemplate = void 0;
const exceljs_1 = __importDefault(require("exceljs"));
const downloadDonorTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const workbook = new exceljs_1.default.Workbook();
        const worksheet = workbook.addWorksheet('Donors');
        // Define columns
        worksheet.columns = [
            { header: 'Full Name', key: 'name', width: 25 },
            { header: 'Email', key: 'email', width: 25 },
            { header: 'Blood Group', key: 'bloodGroup', width: 15 },
            { header: 'Age', key: 'age', width: 10 },
            { header: 'Gender', key: 'gender', width: 12 },
            { header: 'Phone Number', key: 'phone', width: 15 },
            { header: 'City', key: 'city', width: 15 },
            { header: 'Area', key: 'area', width: 15 },
            { header: 'Full Address', key: 'address', width: 40 }
        ];
        // Add some sample data
        worksheet.addRow({
            name: 'John Doe',
            email: 'john@example.com',
            bloodGroup: 'O+',
            age: 25,
            gender: 'Male',
            phone: '9876543210',
            city: 'Mumbai',
            area: 'Andheri',
            address: '123, Blue Street, Mumbai'
        });
        // Add helpful comment note
        worksheet.addRow({});
        worksheet.addRow({ name: 'Note: Blood Group must be one of: A+, A-, B+, B-, AB+, AB-, O+, O-' });
        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=blood_donor_template.xlsx');
        yield workbook.xlsx.write(res);
        res.status(200).end();
    }
    catch (error) {
        console.error('Template generation error:', error);
        res.status(500).json({ message: 'Failed to generate template' });
    }
});
exports.downloadDonorTemplate = downloadDonorTemplate;
