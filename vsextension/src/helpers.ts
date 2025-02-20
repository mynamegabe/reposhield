const fs = require('fs');
const path = require('path');
const uuid = require('uuid');
const re = require('re2');  // Using re2 for regular expression in Node.js
const { program } = require('commander');  // For argument parsing

function getNestedValue(element: any, keys: any, required = false, defaultValue = '') {
    let _element = element;
    let isExist = true;

    for (let key of keys) {
        try {
            _element = _element[key];
        } catch (err) {
            isExist = false;
            if (required) {
                console.error(err);
                throw new Error('Missing required field');
            }
        }
    }

    return isExist ? _element : defaultValue;
}

function convertPrecision(precision: any) {
    precision = precision.toLowerCase();
    if (precision === 'very-high') return 'Confirmed';
    if (precision === 'high') return 'High';
    if (precision === 'medium') return 'Medium';
    if (precision === 'low') return 'Low';
    return 'Unknown';
}

function convertSeverity(score: any) {
    score = parseFloat(score);
    if (score >= 9.0 && score <= 10.0) return 'Critical';
    if (score >= 7.0 && score < 9.0) return 'High';
    if (score >= 4.0 && score < 7.0) return 'Medium';
    if (score >= 0.1 && score < 4.0) return 'Low';
    return 'Unknown';
}

function parseTags(tags: any) {
    return tags.map((tag: string) => ({
        type: tag.toLowerCase().includes('cwe') ? 'cwe' : tag,
        name: tag,
        value: tag.match(/\d+/) ? (tag.match(/\d+/)![0] || '') : '',
    }));
}

function sarif2sast(data: any) {
    const rules = getNestedValue(data, ['runs', 0, 'tool', 'driver', 'rules'], true);
    const results = getNestedValue(data, ['runs', 0, 'results'], true);
    const scannerName = getNestedValue(data, ['runs', 0, 'tool', 'driver', 'name'], false, '');
    const scannerId = scannerName.replace(' ', '_').toLowerCase();
    const scannerVersion = getNestedValue(data, ['runs', 0, 'tool', 'driver', 'semanticVersion']);
    const vendor = getNestedValue(data, ['runs', 0, 'tool', 'driver', 'organization']);

    interface Vulnerability {
        id: string;
        category: string;
        cve: string;
        message: string;
        description: string;
        severity: string;
        confidence: string;
        scanner: { id: string; name: string };
        location: { file: string; start_line: number; end_line: number };
        identifiers: { type: string; name: string; value: string }[];
    }
    
    let out: { version: string; vulnerabilities: Vulnerability[]; remediations: any[]; scan: any } = {
        version: '14.0.0',
        vulnerabilities: [],
        remediations: [],
        scan: {
            messages: [],
            scanner: {
                id: scannerId,
                name: scannerName,
                version: scannerVersion,
                vendor: { name: vendor },
            },
            status: 'success',
            type: 'sast',
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
        },
    };

    for (let item of results) {
        const ruleIndex = getNestedValue(item, ['rule', 'index'], true);
        const message = getNestedValue(rules[ruleIndex], ['shortDescription', 'text'], false, '');
        const description = getNestedValue(rules[ruleIndex], ['fullDescription', 'text'], false, '');
        const severity = convertSeverity(getNestedValue(rules[ruleIndex], ['properties', 'security-severity'], false, '0'));
        const confidence = convertPrecision(getNestedValue(rules[ruleIndex], ['properties', 'precision'], false, ''));

        const uri = getNestedValue(item, ['locations', 0, 'physicalLocation', 'artifactLocation', 'uri']);
        const startLine = getNestedValue(item, ['locations', 0, 'physicalLocation', 'region', 'startLine']);
        const endLine = getNestedValue(item, ['locations', 0, 'physicalLocation', 'region', 'endLine'], false, startLine);

        const identifiers = [{
            type: 'codeql_query_id',
            name: item['ruleId'],
            value: item['ruleId'],
        }];

        const itemId = uuid.v4().replace(/-/g, '');  // Remove hyphens from UUID to match format
        out.vulnerabilities.push({
            id: itemId,
            category: 'sast',
            cve: itemId,
            message: message,
            description: description,
            severity: severity,
            confidence: confidence,
            scanner: { id: scannerId, name: scannerName },
            location: { file: uri, start_line: startLine, end_line: endLine },
            identifiers: identifiers,
        });
    }
    return out;
}

program
    .description('Convert SARIF (v2.1.0) format to SAST format')
    .argument('<file>', 'path to SARIF file')
    .option('-o, --output <output>', 'output file path', 'sast.json')
    .action((file: any, options: any) => {
        const filePath = path.resolve(file);
        const outputPath = path.resolve(options.output);

        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            process.exit(1);
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const result = sarif2sast(data);

        fs.writeFileSync(outputPath, JSON.stringify(result, null, 4));
        console.log(`Output saved to ${outputPath}`);
    });

program.parse(process.argv);
