import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';


export class AwsJenkinsCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const jenkinsHomeDir: string = 'jenkins-home';
    const appName: string = 'jenkins-cdk';


    
  }
}
