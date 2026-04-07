/**
 * generator.js — Generate WebMCP code for forms
 */

const Generator = (() => {

  /**
   * Infer a tool name from form context
   */
  function inferToolName(form) {
    if (form.toolname) return form.toolname;

    // Try form id/name
    if (form.id) return sanitizeName(form.id);
    if (form.name) return sanitizeName(form.name);

    // Try action URL
    if (form.action) {
      const path = new URL(form.action, 'https://example.com').pathname;
      const lastPart = path.split('/').filter(Boolean).pop();
      if (lastPart) return sanitizeName(lastPart);
    }

    // Try nearest heading
    if (form.nearestHeading) return sanitizeName(form.nearestHeading);

    // Try inferring from field names
    const fieldNames = form.fields.map(f => f.name || f.id).filter(Boolean);
    if (fieldNames.length > 0) {
      const commonPrefixes = ['search', 'login', 'signup', 'register', 'contact', 'subscribe', 'filter', 'checkout', 'book', 'order'];
      for (const prefix of commonPrefixes) {
        if (fieldNames.some(n => n.toLowerCase().includes(prefix))) {
          return prefix + '_form';
        }
      }
    }

    return `form_${form.index + 1}`;
  }

  /**
   * Infer a description for a form/tool
   */
  function inferToolDescription(form) {
    if (form.tooldescription) return form.tooldescription;

    const name = inferToolName(form);
    const fieldNames = form.fields.map(f => f.name || f.id || f.placeholder).filter(Boolean);
    const method = form.method || 'GET';

    // Common patterns
    const patterns = {
      search: `Search by ${fieldNames.join(', ')}`,
      login: 'Log in with credentials',
      signup: 'Create a new account',
      register: 'Register a new user',
      contact: 'Send a contact message',
      subscribe: 'Subscribe to newsletter or updates',
      filter: `Filter results by ${fieldNames.join(', ')}`,
      checkout: 'Complete purchase checkout',
      book: 'Make a booking or reservation',
      order: 'Place an order',
      comment: 'Post a comment',
      review: 'Submit a review',
      feedback: 'Submit feedback',
      upload: 'Upload a file',
      settings: 'Update settings or preferences',
      profile: 'Update profile information',
      password: 'Change or reset password'
    };

    for (const [key, desc] of Object.entries(patterns)) {
      if (name.toLowerCase().includes(key)) return desc;
    }

    if (form.nearestHeading) {
      return form.nearestHeading;
    }

    if (fieldNames.length > 0) {
      return `Submit ${fieldNames.slice(0, 3).join(', ')}${fieldNames.length > 3 ? '...' : ''}`;
    }

    return `Form with ${form.fieldCount} field${form.fieldCount > 1 ? 's' : ''}`;
  }

  /**
   * Infer description for a field/parameter
   */
  function inferFieldDescription(field) {
    if (field.toolparamdescription) return field.toolparamdescription;
    if (field.ariaLabel) return field.ariaLabel;
    if (field.label) return field.label;
    if (field.placeholder) return field.placeholder;

    // Infer from name/id
    const identifier = field.name || field.id || '';
    if (!identifier) return '';

    // Common field name patterns
    const meanings = {
      email: 'Email address',
      mail: 'Email address',
      password: 'Password',
      pass: 'Password',
      pwd: 'Password',
      username: 'Username',
      user: 'Username',
      name: 'Full name',
      fname: 'First name',
      first_name: 'First name',
      firstname: 'First name',
      lname: 'Last name',
      last_name: 'Last name',
      lastname: 'Last name',
      phone: 'Phone number',
      tel: 'Phone number',
      mobile: 'Mobile number',
      address: 'Street address',
      city: 'City',
      state: 'State or province',
      zip: 'ZIP or postal code',
      zipcode: 'ZIP code',
      postal: 'Postal code',
      country: 'Country',
      query: 'Search query',
      search: 'Search term',
      q: 'Search query',
      keyword: 'Search keyword',
      message: 'Message content',
      msg: 'Message',
      comment: 'Comment text',
      subject: 'Subject line',
      title: 'Title',
      description: 'Description',
      url: 'URL or web address',
      website: 'Website URL',
      date: 'Date',
      time: 'Time',
      price: 'Price',
      amount: 'Amount',
      quantity: 'Quantity',
      qty: 'Quantity',
      category: 'Category',
      type: 'Type',
      sort: 'Sort order',
      min: 'Minimum value',
      max: 'Maximum value',
      from: 'Start date or origin',
      to: 'End date or destination',
      company: 'Company name',
      organization: 'Organization',
      age: 'Age',
      gender: 'Gender',
      color: 'Color',
      size: 'Size',
    };

    const lower = identifier.toLowerCase().replace(/[-_]/g, '');
    for (const [key, desc] of Object.entries(meanings)) {
      if (lower === key || lower.endsWith(key) || lower.startsWith(key)) return desc;
    }

    // Convert camelCase/snake_case to human readable
    return identifier
      .replace(/([A-Z])/g, ' $1')
      .replace(/[-_]/g, ' ')
      .trim()
      .replace(/^\w/, c => c.toUpperCase());
  }

  /**
   * Map HTML input type to JSON Schema type
   */
  function fieldToSchemaType(field) {
    const typeMap = {
      text: 'string',
      email: 'string',
      url: 'string',
      tel: 'string',
      search: 'string',
      password: 'string',
      number: 'number',
      range: 'number',
      date: 'string',
      time: 'string',
      datetime: 'string',
      'datetime-local': 'string',
      month: 'string',
      week: 'string',
      color: 'string',
      checkbox: 'boolean',
      textarea: 'string'
    };

    if (field.tagName === 'select') return 'string';
    if (field.tagName === 'textarea') return 'string';
    return typeMap[field.type] || 'string';
  }

  /**
   * Get JSON Schema format for a field type
   */
  function fieldToSchemaFormat(field) {
    const formatMap = {
      email: 'email',
      url: 'uri',
      date: 'date',
      time: 'time',
      'datetime-local': 'date-time'
    };
    return formatMap[field.type] || '';
  }

  /**
   * Generate declarative HTML code for a form
   */
  function generateDeclarative(form) {
    const toolName = inferToolName(form);
    const toolDesc = inferToolDescription(form);

    let lines = [];
    lines.push(`<form toolname="${escapeAttr(toolName)}"`);
    lines.push(`      tooldescription="${escapeAttr(toolDesc)}"`);

    if (form.method === 'GET') {
      lines.push(`      toolautosubmit`);
    }

    // Keep existing attributes
    if (form.action) lines.push(`      action="${escapeAttr(form.action)}"`);
    if (form.method) lines.push(`      method="${form.method}"`);
    if (form.id) lines.push(`      id="${escapeAttr(form.id)}"`);
    lines.push(`>`);
    lines.push('');

    form.fields.forEach(field => {
      const desc = inferFieldDescription(field);
      const paramTitle = field.toolparamtitle || '';

      if (field.tagName === 'select') {
        let attrs = [];
        if (field.name) attrs.push(`name="${escapeAttr(field.name)}"`);
        if (desc) attrs.push(`toolparamdescription="${escapeAttr(desc)}"`);
        if (field.required) attrs.push('required');

        lines.push(`  <select ${attrs.join(' ')}>`);
        field.options.forEach(opt => {
          lines.push(`    <option value="${escapeAttr(opt.value)}">${escapeHTML(opt.text)}</option>`);
        });
        lines.push('  </select>');
      } else if (field.tagName === 'textarea') {
        let attrs = [];
        if (field.name) attrs.push(`name="${escapeAttr(field.name)}"`);
        if (desc) attrs.push(`toolparamdescription="${escapeAttr(desc)}"`);
        if (field.required) attrs.push('required');

        lines.push(`  <textarea ${attrs.join(' ')}></textarea>`);
      } else {
        let attrs = [`type="${field.type}"`];
        if (field.name) attrs.push(`name="${escapeAttr(field.name)}"`);
        if (desc) attrs.push(`toolparamdescription="${escapeAttr(desc)}"`);
        if (field.placeholder) attrs.push(`placeholder="${escapeAttr(field.placeholder)}"`);
        if (field.required) attrs.push('required');
        if (field.min) attrs.push(`min="${field.min}"`);
        if (field.max) attrs.push(`max="${field.max}"`);
        if (field.pattern) attrs.push(`pattern="${escapeAttr(field.pattern)}"`);

        lines.push(`  <input ${attrs.join(' ')}>`);
      }
      lines.push('');
    });

    lines.push('  <button type="submit">Submit</button>');
    lines.push('</form>');

    return lines.join('\n');
  }

  /**
   * Generate imperative JavaScript code for a form
   */
  function generateImperative(form) {
    const toolName = inferToolName(form);
    const toolDesc = inferToolDescription(form);
    const isReadOnly = form.method === 'GET';

    // Build inputSchema
    const properties = {};
    const required = [];

    form.fields.forEach(field => {
      const key = field.name || field.id || `field_${form.fields.indexOf(field)}`;
      const desc = inferFieldDescription(field);
      const schemaType = fieldToSchemaType(field);
      const format = fieldToSchemaFormat(field);

      const prop = { type: schemaType };
      if (desc) prop.description = desc;
      if (format) prop.format = format;
      if (field.min) prop.minimum = Number(field.min);
      if (field.max) prop.maximum = Number(field.max);
      if (field.tagName === 'select' && field.options.length > 0) {
        prop.enum = field.options.map(o => o.value);
      }

      properties[key] = prop;
      if (field.required) required.push(key);
    });

    const schema = { type: 'object', properties };
    if (required.length > 0) schema.required = required;

    const schemaStr = JSON.stringify(schema, null, 4).replace(/\n/g, '\n    ');

    let code = '';
    code += '// Feature detection\n';
    code += 'if ("modelContext" in navigator) {\n';
    code += `  navigator.modelContext.registerTool({\n`;
    code += `    name: "${toolName}",\n`;
    code += `    description: "${escapeJS(toolDesc)}",\n`;
    code += `    inputSchema: ${schemaStr.replace(/\n/g, '\n    ')},\n`;
    code += `    annotations: {\n`;
    code += `      readOnlyHint: ${isReadOnly},\n`;
    code += `      destructiveHint: false,\n`;
    code += `      idempotentHint: ${isReadOnly}\n`;
    code += `    },\n`;
    code += `    async execute(input, agent) {\n`;
    code += `      // TODO: Implement your tool logic here\n`;
    code += `      // The 'input' object contains the parameters from the agent\n`;
    code += `      // Return structured data for the agent\n`;
    code += `      \n`;
    code += `      // Example: Fill and submit the form\n`;
    code += `      const form = document.querySelector('${form.id ? '#' + form.id : 'form'}');\n`;

    form.fields.forEach(field => {
      const key = field.name || field.id;
      if (key) {
        code += `      const ${sanitizeVar(key)}El = form.querySelector('[name="${key}"]');\n`;
        code += `      if (${sanitizeVar(key)}El) ${sanitizeVar(key)}El.value = input.${sanitizeVar(key)};\n`;
      }
    });

    code += `      \n`;
    code += `      // Submit the form\n`;
    code += `      form.submit();\n`;
    code += `      \n`;
    code += `      return {\n`;
    code += `        content: [{\n`;
    code += `          type: "text",\n`;
    code += `          text: "Form submitted successfully"\n`;
    code += `        }]\n`;
    code += `      };\n`;
    code += `    }\n`;
    code += `  });\n`;
    code += '}\n';

    return code;
  }

  /**
   * Generate Agent Simulator view data
   */
  function generateAgentView(forms, scriptRegistrations) {
    const tools = [];

    // From declarative forms
    forms.forEach(form => {
      if (!form.hasWebMCP) return;
      tools.push({
        name: form.toolname || inferToolName(form),
        description: form.tooldescription || inferToolDescription(form),
        source: 'declarative',
        params: form.fields.map(f => ({
          name: f.name || f.id || 'unknown',
          type: fieldToSchemaType(f),
          description: f.toolparamdescription || inferFieldDescription(f),
          required: f.required
        }))
      });
    });

    // From JS registrations
    scriptRegistrations.forEach(reg => {
      if (reg.name === '_provideContext') return;
      tools.push({
        name: reg.name,
        description: reg.description,
        source: 'imperative',
        params: []
      });
    });

    return tools;
  }

  /**
   * Generate "After" view — what tools WOULD exist with WebMCP
   */
  function generateAfterView(forms) {
    return forms.map(form => ({
      name: inferToolName(form),
      description: inferToolDescription(form),
      source: 'suggested',
      params: form.fields.map(f => ({
        name: f.name || f.id || 'unknown',
        type: fieldToSchemaType(f),
        description: inferFieldDescription(f),
        required: f.required
      }))
    }));
  }

  // === Utility functions ===

  function sanitizeName(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/-+/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 50)
      .replace(/^_|_$/g, '') || 'unnamed_tool';
  }

  function sanitizeVar(str) {
    return str.replace(/[^a-zA-Z0-9_$]/g, '_').replace(/^[0-9]/, '_$&');
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeJS(str) {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  return {
    generateDeclarative,
    generateImperative,
    generateAgentView,
    generateAfterView,
    inferToolName,
    inferToolDescription,
    inferFieldDescription
  };
})();
