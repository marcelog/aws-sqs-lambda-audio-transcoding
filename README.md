# About
This is the example code that goes with the article at [http://marcelog.github.io/articles/aws_sqs_lambda_sound_file_transcoding.html](http://marcelog.github.io/articles/aws_sqs_lambda_sound_file_transcoding.html).

If you find that using [AWS Elastic Transcoder](https://aws.amazon.com/elastictranscoder/) is too expensive, and you don't want to use an EC2 instance for transcoding, perhaps this might help you out.

By setting up an S3 bucket and a trigger for the PutObject event, an SQS message can be sent and read by a Lambda function, that can use a static SOX binary to do the transcoding and upload the file to another S3 bucket.

See the article mentioned above for the details.

Cheers :)

# Using it
```
$ npm install
$ zip -r transcoder.zip *
```

Read the article for the details.

# License
The source code is released under Apache 2 License.

Check [LICENSE](https://github.com/marcelog/aws-sqs-lambda-audio-transcoding/blob/master/LICENSE) file for more information.
