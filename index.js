const fetch = require('node-fetch');
const crypto = require('crypto');
const stripe = require('stripe')('');

const main = async (svid, hash) => {
    const config = {
        vendor:{
            lZM9p:'亨將精密加工',
            p6wYV:'台灣第一筷'
        },
        price: {
            iatf16949a: 9654,
            iatf16949b: 359,
            iatf16949c: 1659,
            iatf16949d: 2568,
            la222:750,
            la125:1250,
            rosewood:1980
        },
        stripe: {
            iatf16949a: '',
            iatf16949b: '',
            iatf16949c: '',
            iatf16949d: '',
            la222:'',
            la125:'',
            rosewood:''
        }
    };
    let respondData = null;

    const decryptor_url = `https://abc.com?svid=${svid}&hash=${hash}`;
    const surveyResp = await fetch(decryptor_url);
    const surveyData = await surveyResp.json();
    surveyData.submitTime=surveyData.submitTime.replaceAll('-', '/');
    const purchaser = {
        name: surveyData.result.filter(r => r.alias === 'name')[0].answer[0],
        phonoe: surveyData.result.filter(r => r.alias === 'phone')[0].answer[0],
        mail: surveyData.result.filter(r => r.alias === 'mail')[0].answer[0]
    };
    const price = { products: [], totalPrice: 0 };
    const products = surveyData.result.filter(r => r.label === 'product');
    products.forEach(p => {
        if (p.answer[0] !== '0' && p.answer[0] !== undefined) {
            p.answer[0] = Number.parseInt(p.answer[0]);
            const subTotal = config.price[p.alias] * p.answer[0];
            price.totalPrice += subTotal;
            price.products.push({ merchantId: p.alias, merchantName: p.subject, singlePrice: config.price[p.alias], quantity: p.answer[0], total: subTotal });
        }
    });
    switch (surveyData.result.filter(r => r.alias === 'payment')[0].answerAlias[0]) {
        case 'ec':
            respondData = paymentEC(surveyData, price);
            respondData.paymentMethod = 'ec';
            respondData.paymentName = '綠界';
            break;
        case 'stripe':
            const priceStrips = price.products.map(p => ({ price: config.stripe[p.merchantId], quantity: p.quantity }));
            const stripeSession = await stripe.checkout.sessions.create({
                line_items: priceStrips,
                mode: 'payment',
                success_url: 'https://zh.wikipedia.org/wiki/Wikipedia',
                cancel_url: 'https://zh.wikipedia.org/wiki/%E9%95%BF%E9%B3%8D%E9%87%91%E6%9E%AA%E9%B1%BC'
            });
            respondData = {};
            respondData.paymentMethod = 'stripe';
            respondData.paymentName = 'stripe';
            respondData.redirect_url = stripeSession.url;
            break;
        default:
            break;
    }

    respondData.vendorName = config.vendor[svid];
    respondData.merchantTradeNo = surveyData.id;
    respondData.merchantTradeDate = surveyData.submitTime;
    respondData.purchaserInfo = purchaser;
    respondData.order = price;

    return respondData;
}

const getMacValue = (data, hashKey, hashIV) => {
    const keys = Object.keys(data).sort((l, r) => l > r ? 1 : -1);
    let checkValue = '';
    for (const key of keys) { checkValue += `${key}=${data[key]}&` };
    checkValue = `HashKey=${hashKey}&${checkValue}HashIV=${hashIV}`;
    checkValue = encodeURIComponent(checkValue).toLowerCase();
    checkValue = checkValue.replace(/%20/g, '+')
        .replace(/%2d/g, '-')
        .replace(/%5f/g, '_')
        .replace(/%2e/g, '.')
        .replace(/%21/g, '!')
        .replace(/%2a/g, '*')
        .replace(/%28/g, '(')
        .replace(/%29/g, ')')
        .replace(/%20/g, '+');
    checkValue = crypto.createHash('sha256').update(checkValue).digest('hex');
    checkValue = checkValue.toUpperCase();

    return checkValue;
}

const paymentEC = (surveyData, price) => {
    const secret = {
        hashKey: '',
        hashIv: ''
    };
    const itemName = price.products.reduce((acc, cur, i) => {
        return `${acc}${cur.merchantName}${i === price.products.length - 1 ? "" : "#"}`;
    }, '');
    const data = {
        ChoosePayment: 'ALL',
        EncryptType: 1,
        ItemName: itemName,
        MerchantID: 3002607,
        MerchantTradeDate: surveyData.submitTime,
        MerchantTradeNo: surveyData.id,
        PaymentType: 'aio',
        ReturnURL: 'https://zh.wikipedia.org/wiki',
        TotalAmount: price.totalPrice,
        TradeDesc: surveyData.title
    };

    let macValue = getMacValue(data, secret.hashKey, secret.hashIv);
    data.CheckMacValue = macValue;


    return data;
}

exports.handler = async (event) => {
    const SVID = event.queryStringParameters.svid;
    const HASH = event.queryStringParameters.hash;
    const result = await main(SVID, HASH);

    return {
        statusCode: 200,
        body: result
    };
}