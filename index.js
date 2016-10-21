var Promise = require('promise');
var aws = require('aws-sdk');
var fs = require('fs');
var path = require('path');
var exec = require('child_process').execFileSync;

exports.handler = function(event, context, callback) {
  var sqsRegion = 'setup_this';
  var queue = 'setup_this';
  var outputBucket = 'setup_this';
  var awsAccountId = 'setup_this';
  var outputFormat = 'mp3';
  var outputContentType = 'audio/mpeg';
  var outputRegion = 'setup_this';
  var queueUrl = 'https://' + ['sqs', sqsRegion, 'amazonaws', 'com'].join('.');
  queueUrl = [queueUrl, awsAccountId, queue].join('/');

  getMessages(
    sqsRegion, queueUrl, 10, 10
  ).then(function(messages) {
    return Promise.all(messages.map(function(message) {
      return processMessage(
        message, sqsRegion, queueUrl, outputRegion, outputBucket,
        outputFormat, outputContentType
      );
    }));
  }).catch(function(err) {
    callback(err);
  });
};

function s3Del(region, bucket, key) {
  return new Promise(function(resolve, reject) {
    console.log('Deleting ' + [region, bucket, key].join(':'));
    var s3 = new aws.S3({
      region: region
    });
    var params = {
      Bucket: bucket,
      Key: key
    };
    s3.deleteObject(params, function(err) {
      if(err) {
        return reject(err);
      }
      return resolve();
    });
  });
};

function s3Put(source, contentType, region, bucket, key) {
  return new Promise(function(resolve, reject) {
    console.log(
      'Uploading ' + source + ' (' + contentType + ') to ' +
      [region, bucket, key].join(':')
    );
    var s3 = new aws.S3({
      region: region
    });
    var params = {
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(source),
      ContentType: contentType
    };
    s3.putObject(params, function(err) {
      if(err) {
        return reject(err);
      }
      return resolve();
    });
  });
};

function s3Get(region, bucket, key) {
  return new Promise(function(resolve, reject) {
    console.log('Downloading ' + [region, bucket, key].join(':'));
    var s3 = new aws.S3({
      region: region
    });
    var params = {
      Bucket: bucket,
      Key: key
    };
    var target = '/tmp/' + path.basename(key);
    var file = fs.createWriteStream(target);
    var stream = s3.getObject(params).createReadStream();
    stream.on('finish', function() {
      resolve(target);
    });
    stream.on('error', function(err) {
      reject(err);
    });
    stream.pipe(file)
  });
}

function delMessage(region, queueUrl, receiptHandle) {
  return new Promise(function(resolve, reject) {
    console.log(
      'Deleting message ' + [region, queueUrl, receiptHandle].join(':')
    );
    var sqs = new aws.SQS({
      region: region
    });
    var params = {
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle
    };
    sqs.deleteMessage(params, function(err, data) {
      if(err) {
        return reject(err);
      }
      return resolve(data);
    });
  });
}

function getMessages(region, queueUrl, messages, waitTimeout) {
  return new Promise(function(resolve, reject) {
    var sqs = new aws.SQS({
      region: region
    });
    var params = {
      QueueUrl: queueUrl,
      AttributeNames: ['All'],
      MaxNumberOfMessages: messages,
      MessageAttributeNames: ['All'],
      WaitTimeSeconds: waitTimeout
    };
    sqs.receiveMessage(params, function(err, data) {
      if(err) {
        return reject(err);
      }
      if(!data.Messages) {
        return resolve([]);
      }
      return resolve(data.Messages);
    });
  });
};

function processFile(
  sourceRegion, sourceBucket, sourceKey,
  outputRegion, outputBucket, outputFormat, outputContentType
) {
  return Promise.resolve().then(function() {
    return s3Get(sourceRegion, sourceBucket, sourceKey);
  }).then(function(localFile) {
    var extension = path.extname(localFile);
    var targetFile = localFile.replace(extension, '.' + outputFormat);
    var ret = exec(
      __dirname + '/sox', [localFile, targetFile], {encoding: 'ascii'}
    );
    return {source: localFile, target: targetFile};
  }).then(function(result) {
    console.log('Transcoded ' + result.source + ' to ' + result.target);
    console.log('Deleting from FS ' + result.source);
    fs.unlinkSync(result.source);
    return result;
  }).then(function(result) {
    return s3Put(
      result.target, outputContentType, outputRegion, outputBucket,
      path.dirname(sourceKey) + '/' + path.basename(result.target)
    ).then(function() {
      return result;
    });
  }).then(function(result) {
    console.log('Deleting from FS ' + result.target);
    fs.unlinkSync(result.target);
    return result;
  }).then(function(result) {
    s3Del(sourceRegion, sourceBucket, sourceKey);
    return result;
  });
}

function processMessage(
  message, sqsRegion, queueUrl, outputRegion, outputBucket,
  outputFormat, outputContentType
) {
  return Promise.resolve().then(function() {
    console.log('Processing message ' + message.MessageId);
    var body = JSON.parse(message.Body);
    return Promise.all(body.Records.map(function(record) {
      var sourceRegion = record.awsRegion;
      var sourceBucket = record.s3.bucket.name;
      var sourceKey = record.s3.object.key;
      return processFile(
        sourceRegion, sourceBucket, sourceKey,
        outputRegion, outputBucket, outputFormat, outputContentType
      ).then(function() {
        return delMessage(sqsRegion, queueUrl, message.ReceiptHandle);
      });
    }));
  });
};
